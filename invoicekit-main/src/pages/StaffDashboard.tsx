import { useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { supabase } from "../lib/supabase";
import { hasStaffPermission, STAFF_ROLE_LABELS, type StaffMember, type StaffRole } from "../lib/staffPermissions";
import CommunicationCenter from "../components/CommunicationCenter";
import WorkspaceTools from "../components/WorkspaceTools";
import PasswordField from "../components/PasswordField";

interface TaskRow {
  id: string; title: string; description?: string | null; status: string; priority: string; due_date: string | null; progress?: number | null; staff_notes?: string | null; internal_notes?: string | null; department?: string | null; last_staff_update?: string | null;
  resources?: { label?: string; url?: string }[] | null;
  requires_verification?: boolean | null;
  draft_content?: string | null;
  ai_verification_status?: "pending" | "pass" | "fail" | null;
  ai_verification_feedback?: string | null;
  submission_url?: string | null;
  submission_screenshot_url?: string | null;
  submission_notes?: string | null;
  submitted_at?: string | null;
  task_type?: "simple" | "queue";
  queue_field_schema?: { key: string; label: string }[] | null;
}
interface QueueItemRow {
  id: string; task_id: string; data: Record<string, string>; status: "pending" | "red" | "orange" | "green";
  proof_notes: string | null; proof_screenshot_url: string | null; proof_recording_url: string | null;
  marked_at: string | null; sort_order: number;
}
interface TicketRow { id: string; user_id?: string | null; ticket_number?: string | null; subject: string; message?: string | null; status: string; priority: string; created_at: string; staff_notes?: string | null; sla_target_minutes?: number | null; first_admin_reply_at?: string | null; assigned_to?: string | null; resolution_summary?: string | null; category?: string | null; }
interface TicketMessage { id: string; author_type: string; message: string; is_internal: boolean; created_at: string; }
interface CustomerContext { email: string | null; business_name: string | null; pastTicketCount: number; invoiceCount: number; invoiceTotal: number }
interface CannedResponse { id: string; title: string; body: string }
interface FinanceRow { id: string; type: string; source: string; amount: number; currency: string; status: string; title: string; }
interface NotificationRow { id: string; title: string; body: string | null; type: string; read_at: string | null; created_at: string; metadata?: { task_id?: string; ticket_id?: string; channel_id?: string } | null; }

const taskStatuses = ["pending", "in_progress", "blocked", "done"];

function ticketSla(ticket: TicketRow) {
  if (ticket.first_admin_reply_at) return "First response sent";
  const due = new Date(ticket.created_at).getTime() + Number(ticket.sla_target_minutes || 1440) * 60000;
  const minutes = Math.ceil((due - Date.now()) / 60000);
  if (minutes <= 0) return `SLA breached ${Math.abs(minutes)}m`;
  return minutes < 60 ? `${minutes}m remaining` : `${Math.ceil(minutes / 60)}h remaining`;
}

function StatCard({ label, value, note, icon }: { label: string; value: string | number; note?: string; icon: string }) {
  return (
    <div className="rounded-3xl bg-white border border-slate-200 p-5 shadow-sm hover:shadow-md transition">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-xs font-bold uppercase tracking-wide text-slate-500">{label}</div>
          <div className="text-3xl font-black text-slate-950 mt-2">{value}</div>
          {note && <div className="text-xs text-slate-500 mt-2">{note}</div>}
        </div>
        <div className="w-12 h-12 rounded-2xl bg-slate-100 flex items-center justify-center text-xl">{icon}</div>
      </div>
    </div>
  );
}

function Badge({ children, tone = "slate" }: { children: string; tone?: "slate" | "green" | "red" | "amber" | "blue" | "purple" }) {
  const cls = {
    slate: "bg-slate-100 text-slate-700 border-slate-200",
    green: "bg-emerald-50 text-emerald-700 border-emerald-200",
    red: "bg-red-50 text-red-700 border-red-200",
    amber: "bg-amber-50 text-amber-700 border-amber-200",
    blue: "bg-blue-50 text-blue-700 border-blue-200",
    purple: "bg-purple-50 text-purple-700 border-purple-200",
  }[tone];
  return <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-bold ${cls}`}>{children}</span>;
}

function taskStatusLabel(status: string) {
  if (status === "pending") return "Assigned";
  if (status === "in_progress") return "In Progress";
  if (status === "blocked") return "Need Help";
  if (status === "done") return "Completed";
  return status.replace("_", " ");
}

function appendLog(existing: string | null | undefined, author: string, text: string) {
  const stamp = new Date().toLocaleString();
  const clean = text.trim();
  if (!clean) return existing ?? "";
  return `${existing ? `${existing}\n\n` : ""}[${stamp}] ${author}: ${clean}`;
}

function Section({ title, subtitle, children, actions }: { title: string; subtitle?: string; children: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <section className="rounded-3xl bg-white border border-slate-200 shadow-sm overflow-hidden">
      <div className="p-5 sm:p-6 border-b border-slate-100 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <h2 className="text-xl font-black text-slate-950">{title}</h2>
          {subtitle && <p className="text-sm text-slate-500 mt-1">{subtitle}</p>}
        </div>
        {actions}
      </div>
      {children}
    </section>
  );
}

export default function StaffDashboard() {
  const { user } = useAuth();
  const [staff, setStaff] = useState<StaffMember | null>(null);
  const [tasks, setTasks] = useState<TaskRow[]>([]);
  const [tickets, setTickets] = useState<TicketRow[]>([]);
  const [finance, setFinance] = useState<FinanceRow[]>([]);
  const [notifications, setNotifications] = useState<NotificationRow[]>([]);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [taskFilter, setTaskFilter] = useState("open");
  const [ticketFilter, setTicketFilter] = useState("open");
  const [taskSearch, setTaskSearch] = useState("");
  const [ticketSearch, setTicketSearch] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [updatingPassword, setUpdatingPassword] = useState(false);
  const [active, setActive] = useState(() => window.location.hash.replace("#", "") || "dashboard");
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [taskComment, setTaskComment] = useState("");
  const [draftContent, setDraftContent] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [submissionUrl, setSubmissionUrl] = useState("");
  const [submissionScreenshotUrl, setSubmissionScreenshotUrl] = useState("");
  const [submissionNotes, setSubmissionNotes] = useState("");
  const [submittingProof, setSubmittingProof] = useState(false);
  const [queueTaskId, setQueueTaskId] = useState<string | null>(null);
  const [queueItemsState, setQueueItemsState] = useState<QueueItemRow[]>([]);
  const [queueSession, setQueueSession] = useState<{ id: string; started_at: string } | null>(null);
  const [queueItemFilter, setQueueItemFilter] = useState<"all" | "pending" | "red" | "orange" | "green">("all");
  const [selectedQueueItemId, setSelectedQueueItemId] = useState<string | null>(null);
  const [queueDraft, setQueueDraft] = useState({ notes: "", screenshotUrl: "", recordingUrl: "" });
  const [queueFileUploading, setQueueFileUploading] = useState<"screenshot" | "recording" | null>(null);
  const [queueItemSaving, setQueueItemSaving] = useState(false);
  const [recordingState, setRecordingState] = useState<"idle" | "requesting" | "recording" | "unsupported" | "denied">("idle");
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const recordingUploadTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const recordingSessionIdRef = useRef<string | null>(null);
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);
  const [ticketMessages, setTicketMessages] = useState<TicketMessage[]>([]);
  const [ticketReply, setTicketReply] = useState("");
  const [resolutionNote, setResolutionNote] = useState("");
  const [ticketBusy, setTicketBusy] = useState(false);
  const [ticketViewFilter, setTicketViewFilter] = useState<"open" | "resolved">("open");
  const [customerContext, setCustomerContext] = useState<CustomerContext | null>(null);
  const [cannedResponses, setCannedResponses] = useState<CannedResponse[]>([]);
  const [internalNote, setInternalNote] = useState("");
  const [customerTyping, setCustomerTyping] = useState(false);
  const ticketTypingChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  useEffect(() => {
    const onHash = () => setActive(window.location.hash.replace("#", "") || "dashboard");
    window.addEventListener("hashchange", onHash);
    onHash();
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  async function load() {
    if (!user) return;
    const email = user.email?.toLowerCase() ?? "";
    const { data: staffData } = await supabase
      .from("admin_team_members")
      .select("id, auth_user_id, email, name, role, status, notes, created_at")
      .or(`auth_user_id.eq.${user.id},email.eq.${email}`)
      .maybeSingle();
    if (!staffData) return;
    const team = staffData as StaffMember;
    setStaff(team);

    if (hasStaffPermission(team.role, "tasks")) {
      const { data: taskData } = await supabase
        .from("admin_tasks")
        .select("id, title, description, status, priority, due_date, progress, staff_notes, internal_notes, department, last_staff_update, resources, requires_verification, draft_content, ai_verification_status, ai_verification_feedback, submission_url, submission_screenshot_url, submission_notes, submitted_at, task_type, queue_field_schema")
        .or(`assigned_to.eq.${team.id},assigned_to.is.null`)
        .order("created_at", { ascending: false })
        .limit(40);
      setTasks((taskData as TaskRow[]) ?? []);
    }

    {
      const canBrowseQueue = hasStaffPermission(team.role, "tickets");
      const { data: ticketData } = await supabase
        .from("admin_support_tickets")
        .select("id, user_id, ticket_number, subject, message, status, priority, created_at, staff_notes, sla_target_minutes, first_admin_reply_at, assigned_to, resolution_summary, category")
        .or(canBrowseQueue ? `assigned_to.eq.${team.id},assigned_to.is.null` : `assigned_to.eq.${team.id}`)
        .order("created_at", { ascending: false })
        .limit(40);
      setTickets((ticketData as TicketRow[]) ?? []);
    }

    const { data: notificationData } = await supabase
      .from("notifications")
      .select("id, title, body, type, read_at, created_at, metadata")
      .is("read_at", null)
      .or(`recipient_team_member_id.eq.${team.id},and(recipient_team_member_id.is.null,role.eq.${team.role}),and(recipient_team_member_id.is.null,role.is.null,audience.eq.staff),and(recipient_team_member_id.is.null,role.is.null,audience.eq.all)`)
      .order("created_at", { ascending: false })
      .limit(20);
    setNotifications((notificationData as NotificationRow[]) ?? []);

    if (hasStaffPermission(team.role, "finance")) {
      const { data: financeData } = await supabase
        .from("admin_finance_entries")
        .select("id, type, source, amount, currency, status, title")
        .order("entry_date", { ascending: false })
        .limit(20);
      setFinance((financeData as FinanceRow[]) ?? []);
    }
  }

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [user]);

  // Stop any in-progress screen recording if the staff member navigates away
  // from the dashboard entirely (logout, tab close) without clicking End.
  useEffect(() => {
    return () => {
      if (recordingUploadTimerRef.current) clearInterval(recordingUploadTimerRef.current);
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") mediaRecorderRef.current.stop();
      if (mediaStreamRef.current) mediaStreamRef.current.getTracks().forEach((t) => t.stop());
    };
  }, []);

  useEffect(() => {
    if (!staff) return;
    const channel = supabase
      .channel(`staff-live-data-${staff.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "admin_tasks" }, () => { void load(); })
      .on("postgres_changes", { event: "*", schema: "public", table: "admin_support_tickets" }, () => { void load(); })
      .on("postgres_changes", { event: "*", schema: "public", table: "notifications" }, () => { void load(); })
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [staff?.id]);

  const role = staff?.role as StaffRole | undefined;
  const todayIso = new Date().toISOString().slice(0, 10);
  const openTaskCount = tasks.filter((t) => t.status !== "done").length;
  const completedTaskCount = tasks.filter((t) => t.status === "done").length;
  const completedTicketCount = tickets.filter((t) => t.status === "resolved" || t.status === "closed").length;
  const completedCount = completedTaskCount + completedTicketCount;
  const dueTodayTasks = tasks.filter((t) => t.due_date === todayIso && t.status !== "done").length;
  const openTicketCount = tickets.filter((t) => t.status !== "resolved" && t.status !== "closed").length;
  const urgentTickets = tickets.filter((t) => t.priority === "urgent" && t.status !== "closed" && t.status !== "resolved").length;
  const incomeTotal = useMemo(() => finance.filter((f) => f.type === "income").reduce((sum, row) => sum + Number(row.amount || 0), 0), [finance]);

  const filteredTasks = tasks.filter((task) => {
    const search = taskSearch.trim().toLowerCase();
    const matchesSearch = !search || `${task.title} ${task.description ?? ""} ${task.priority} ${task.status}`.toLowerCase().includes(search);
    if (!matchesSearch) return false;
    if (taskFilter === "all") return true;
    if (taskFilter === "open") return task.status !== "done";
    if (taskFilter === "due_today") return task.due_date === todayIso && task.status !== "done";
    return task.status === taskFilter;
  });

  const filteredTickets = tickets.filter((ticket) => {
    const search = ticketSearch.trim().toLowerCase();
    const matchesSearch = !search || `${ticket.subject} ${ticket.message ?? ""} ${ticket.priority} ${ticket.status}`.toLowerCase().includes(search);
    if (!matchesSearch) return false;
    if (ticketFilter === "all") return true;
    if (ticketFilter === "open") return ticket.status !== "resolved" && ticket.status !== "closed";
    if (ticketFilter === "urgent") return ticket.priority === "urgent";
    return ticket.status === ticketFilter;
  });

  const selectedTask = selectedTaskId ? tasks.find((task) => task.id === selectedTaskId) ?? null : null;

  useEffect(() => {
    setDraftContent(selectedTask?.draft_content || "");
    setSubmissionUrl(selectedTask?.submission_url || "");
    setSubmissionScreenshotUrl(selectedTask?.submission_screenshot_url || "");
    setSubmissionNotes(selectedTask?.submission_notes || "");
  }, [selectedTaskId]); // eslint-disable-line react-hooks/exhaustive-deps

  async function markNotificationRead(notificationId: string) {
    await supabase.from("notifications").update({ read_at: new Date().toISOString() }).eq("id", notificationId);
    await load();
  }
  async function markAllNotificationsRead() {
    if (!staff) return;
    await supabase.from("notifications").update({ read_at: new Date().toISOString() }).is("read_at", null).or(`recipient_team_member_id.eq.${staff.id},and(recipient_team_member_id.is.null,role.eq.${staff.role}),and(recipient_team_member_id.is.null,role.is.null,audience.eq.staff),and(recipient_team_member_id.is.null,role.is.null,audience.eq.all)`);
    await load();
  }

  async function updateTask(taskId: string, changes: Partial<TaskRow>) {
    setSavingId(taskId); setMessage(null);
    const payload: Record<string, unknown> = { ...changes, last_staff_update: new Date().toISOString() };
    if (changes.status === "done") payload.completed_at = new Date().toISOString();
    const { error } = await supabase.from("admin_tasks").update(payload).eq("id", taskId);
    setSavingId(null);
    if (error) { setMessage(`Task update failed: ${error.message}`); return; }
    await supabase.from("admin_audit_logs").insert({ actor_user_id: user?.id, action: "staff_task_update", target_type: "task", target_id: taskId, details: { changes, staff_email: user?.email } });
    await supabase.rpc("notify_admin", { p_type: "task_update", p_title: "Task updated by staff", p_body: `${user?.email ?? "Staff"} updated a task.`, p_metadata: { task_id: taskId, changes } });
    setMessage("Task updated successfully."); await load();
  }

  async function quickTaskAction(task: TaskRow, status: string, progress: number) {
    await updateTask(task.id, { status, progress });
  }

  async function addTaskComment(task: TaskRow) {
    const nextNotes = appendLog(task.staff_notes, staff?.name || user?.email || "Staff", taskComment);
    setTaskComment("");
    await updateTask(task.id, { staff_notes: nextNotes });
  }

  async function verifyDraft(task: TaskRow) {
    if (!draftContent.trim()) { setMessage("Write your draft before verifying."); return; }
    setVerifying(true); setMessage(null);
    const { data, error } = await supabase.functions.invoke("verify-task-content", {
      body: { task_id: task.id, draft_content: draftContent.trim() },
    });
    setVerifying(false);
    if (error || data?.error) {
      setMessage(`AI verification failed: ${data?.error || error?.message || "Unknown error"}`);
      await load();
      return;
    }
    setMessage(data.verdict === "pass" ? "✅ AI verification passed." : "❌ AI verification failed — see feedback and revise your draft.");
    await load();
  }

  async function submitTaskWithProof(task: TaskRow) {
    if (task.requires_verification && task.ai_verification_status !== "pass") {
      setMessage("This task needs AI verification to pass before you can submit it.");
      return;
    }
    if (!submissionUrl.trim() && !submissionScreenshotUrl.trim() && !submissionNotes.trim()) {
      setMessage("Add a proof link, screenshot link, or note before submitting.");
      return;
    }
    setSubmittingProof(true); setMessage(null);
    await updateTask(task.id, {
      submission_url: submissionUrl.trim() || null,
      submission_screenshot_url: submissionScreenshotUrl.trim() || null,
      submission_notes: submissionNotes.trim() || null,
      submitted_at: new Date().toISOString(),
      status: "done",
      progress: 100,
    } as Partial<TaskRow>);
    setSubmittingProof(false);
    setMessage("Task submitted for review.");
  }

  // ---- Lead / Item Queue workspace ----------------------------------------

  async function openQueueWorkspace(task: TaskRow) {
    setQueueTaskId(task.id);
    setQueueSession(null);
    setQueueItemFilter("all");
    setRecordingState("idle");
    const { data } = await supabase.from("task_queue_items").select("*").eq("task_id", task.id).order("sort_order");
    setQueueItemsState((data as QueueItemRow[]) ?? []);
  }

  // Uploads whatever has been recorded so far, overwriting the same storage
  // object. Simpler and safer than merging chunks server-side: if the tab
  // crashes mid-session, the last periodic upload is still a valid, playable
  // recording (just missing the last <30s), instead of losing everything.
  async function uploadRecordingSnapshot(sessionId: string) {
    if (recordedChunksRef.current.length === 0) return;
    const blob = new Blob(recordedChunksRef.current, { type: "video/webm" });
    const path = `${sessionId}.webm`;
    const { error } = await supabase.storage.from("task-session-recordings").upload(path, blob, { contentType: "video/webm", upsert: true });
    if (error) return;
    const { data } = supabase.storage.from("task-session-recordings").getPublicUrl(path);
    await supabase.from("task_sessions").update({ recording_url: data.publicUrl }).eq("id", sessionId);
  }

  function stopScreenRecording() {
    if (recordingUploadTimerRef.current) { clearInterval(recordingUploadTimerRef.current); recordingUploadTimerRef.current = null; }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") mediaRecorderRef.current.stop();
    if (mediaStreamRef.current) { mediaStreamRef.current.getTracks().forEach((t) => t.stop()); mediaStreamRef.current = null; }
    mediaRecorderRef.current = null;
  }

  async function startScreenRecording(task: TaskRow, sessionId: string) {
    recordingSessionIdRef.current = sessionId;
    recordedChunksRef.current = [];

    if (!navigator.mediaDevices?.getDisplayMedia) {
      setRecordingState("unsupported");
      setMessage("Screen recording isn't supported on this browser/device — continuing without it. Use a desktop browser (Chrome/Edge) for recorded sessions.");
      return;
    }

    setRecordingState("requesting");
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
    } catch {
      setRecordingState("denied");
      setMessage("Screen-share permission was not granted — continuing without recording.");
      return;
    }

    mediaStreamRef.current = stream;
    // If the person uses the browser's own "Stop sharing" control, end the
    // session gracefully instead of leaving it in a broken half-recording state.
    stream.getVideoTracks()[0]?.addEventListener("ended", () => {
      stopScreenRecording();
      setRecordingState("idle");
      void endQueueSession(task, false);
    });

    const mimeType = MediaRecorder.isTypeSupported("video/webm;codecs=vp9,opus") ? "video/webm;codecs=vp9,opus" : "video/webm";
    const recorder = new MediaRecorder(stream, { mimeType });
    recorder.ondataavailable = (e) => { if (e.data.size > 0) recordedChunksRef.current.push(e.data); };
    recorder.start(5000); // emit a chunk every 5s
    mediaRecorderRef.current = recorder;
    setRecordingState("recording");

    recordingUploadTimerRef.current = setInterval(() => { void uploadRecordingSnapshot(sessionId); }, 30000);
  }

  async function startQueueSession(task: TaskRow) {
    if (!staff?.id) return;
    const { data, error } = await supabase.from("task_sessions").insert({ task_id: task.id, staff_id: staff.id }).select("id, started_at").single();
    if (error) { setMessage(error.message); return; }
    setQueueSession(data);
    await supabase.from("task_activity_log").insert({ task_id: task.id, session_id: data.id, staff_id: staff.id, action: "session_start", details: {} });
    if (task.status === "pending") await updateTask(task.id, { status: "in_progress" } as Partial<TaskRow>);
    await startScreenRecording(task, data.id);
  }

  async function endQueueSession(task: TaskRow, completed: boolean) {
    if (!queueSession) return;
    const sessionId = queueSession.id;
    if (recordingState === "recording") {
      stopScreenRecording();
      await new Promise((r) => setTimeout(r, 400)); // let the final ondataavailable flush land
      await uploadRecordingSnapshot(sessionId);
    }
    setRecordingState("idle");
    await supabase.from("task_sessions").update({
      status: completed ? "completed" : "interrupted",
      ended_at: new Date().toISOString(),
      items_worked: queueItemsState.filter((i) => i.status !== "pending").length,
    }).eq("id", sessionId);
    await supabase.from("task_activity_log").insert({ task_id: task.id, session_id: sessionId, staff_id: staff?.id, action: "session_end", details: { completed } });
    setQueueSession(null);
    if (completed) await updateTask(task.id, { status: "done", progress: 100 } as Partial<TaskRow>);
    await load();
  }


  function openQueueItem(task: TaskRow, item: QueueItemRow) {
    setSelectedQueueItemId(item.id);
    setQueueDraft({ notes: item.proof_notes || "", screenshotUrl: item.proof_screenshot_url || "", recordingUrl: item.proof_recording_url || "" });
    if (queueSession) void supabase.from("task_activity_log").insert({ task_id: task.id, queue_item_id: item.id, session_id: queueSession.id, staff_id: staff?.id, action: "item_opened", details: {} });
  }

  async function uploadQueueProofFile(file: File, kind: "screenshot" | "recording") {
    if (!user) return;
    setQueueFileUploading(kind);
    try {
      const ext = file.name.split(".").pop() || "bin";
      const path = `${user.id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const { error: uploadError } = await supabase.storage.from("task-attachments").upload(path, file, { contentType: file.type, upsert: false });
      if (uploadError) { setMessage(uploadError.message); return; }
      const { data } = supabase.storage.from("task-attachments").getPublicUrl(path);
      setQueueDraft((cur) => ({ ...cur, [kind === "screenshot" ? "screenshotUrl" : "recordingUrl"]: data.publicUrl }));
    } finally {
      setQueueFileUploading(null);
    }
  }

  async function markQueueItem(task: TaskRow, item: QueueItemRow, status: "red" | "orange" | "green") {
    if (!queueDraft.notes.trim() && !queueDraft.screenshotUrl.trim() && !queueDraft.recordingUrl.trim()) {
      setMessage("Add proof (notes, chat screenshot, or call recording) before marking this item.");
      return;
    }
    setQueueItemSaving(true);
    const { error } = await supabase.from("task_queue_items").update({
      status,
      proof_notes: queueDraft.notes.trim() || null,
      proof_screenshot_url: queueDraft.screenshotUrl.trim() || null,
      proof_recording_url: queueDraft.recordingUrl.trim() || null,
      marked_by: staff?.id ?? null,
      marked_at: new Date().toISOString(),
    }).eq("id", item.id);
    setQueueItemSaving(false);
    if (error) { setMessage(error.message); return; }

    if (queueSession) {
      await supabase.from("task_activity_log").insert({ task_id: task.id, queue_item_id: item.id, session_id: queueSession.id, staff_id: staff?.id, action: "item_marked", details: { status } });
    }

    setQueueItemsState((cur) => cur.map((i) => i.id === item.id ? { ...i, status, proof_notes: queueDraft.notes.trim() || null, proof_screenshot_url: queueDraft.screenshotUrl.trim() || null, proof_recording_url: queueDraft.recordingUrl.trim() || null, marked_at: new Date().toISOString() } : i));
    setSelectedQueueItemId(null);
    setQueueDraft({ notes: "", screenshotUrl: "", recordingUrl: "" });
  }

  async function updateTicket(ticketId: string, changes: Partial<TicketRow>) {
    setSavingId(ticketId); setMessage(null);
    const payload: Record<string, unknown> = { ...changes, last_staff_update: new Date().toISOString() };
    if (changes.status === "resolved" || changes.status === "closed") payload.resolved_at = new Date().toISOString();
    const { error } = await supabase.from("admin_support_tickets").update(payload).eq("id", ticketId);
    setSavingId(null);
    if (error) { setMessage(`Ticket update failed: ${error.message}`); return; }
    await supabase.from("admin_audit_logs").insert({ actor_user_id: user?.id, action: "staff_ticket_update", target_type: "support_ticket", target_id: ticketId, details: { changes, staff_email: user?.email } });
    await supabase.rpc("notify_admin", { p_type: "ticket_update", p_title: "Ticket updated by staff", p_body: `${user?.email ?? "Staff"} updated a support ticket.`, p_metadata: { ticket_id: ticketId, changes } });
    setMessage("Ticket updated successfully."); await load();
  }

  const selectedTicket = selectedTicketId ? tickets.find((t) => t.id === selectedTicketId) ?? null : null;

  useEffect(() => {
    if (!selectedTicketId) { setTicketMessages([]); setCustomerContext(null); return; }
    void loadTicketMessages(selectedTicketId);
    const channel = supabase
      .channel(`staff-ticket-thread-${selectedTicketId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "support_ticket_messages", filter: `ticket_id=eq.${selectedTicketId}` }, () => { void loadTicketMessages(selectedTicketId); })
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [selectedTicketId]);

  useEffect(() => {
    if (!selectedTicketId) { setCustomerTyping(false); return; }
    let clearTimer: number | undefined;
    const typingChannel = supabase.channel(`ticket-typing-${selectedTicketId}`, { config: { broadcast: { self: false } } });
    typingChannel.on("broadcast", { event: "typing" }, ({ payload }) => {
      if (payload?.from !== "customer") return;
      setCustomerTyping(true);
      window.clearTimeout(clearTimer);
      clearTimer = window.setTimeout(() => setCustomerTyping(false), 3000);
    }).subscribe();
    ticketTypingChannelRef.current = typingChannel;
    return () => { window.clearTimeout(clearTimer); void supabase.removeChannel(typingChannel); ticketTypingChannelRef.current = null; setCustomerTyping(false); };
  }, [selectedTicketId]);

  function broadcastStaffTyping() {
    void ticketTypingChannelRef.current?.send({ type: "broadcast", event: "typing", payload: { from: "staff" } });
  }

  useEffect(() => {
    const userId = selectedTicket?.user_id;
    if (!userId) { setCustomerContext(null); return; }
    void (async () => {
      const [profileRes, ticketCountRes, invoiceRes] = await Promise.all([
        supabase.from("profiles").select("email,business_name").eq("user_id", userId).maybeSingle(),
        supabase.from("admin_support_tickets").select("id", { count: "exact", head: true }).eq("user_id", userId).neq("id", selectedTicketId as string),
        supabase.from("invoices").select("invoice_total").eq("user_id", userId),
      ]);
      const invoices = (invoiceRes.data as { invoice_total?: number }[] | null) ?? [];
      setCustomerContext({
        email: profileRes.data?.email ?? null,
        business_name: profileRes.data?.business_name ?? null,
        pastTicketCount: ticketCountRes.count ?? 0,
        invoiceCount: invoices.length,
        invoiceTotal: invoices.reduce((sum, i) => sum + (Number(i.invoice_total) || 0), 0),
      });
    })();
  }, [selectedTicket?.user_id, selectedTicketId]);

  useEffect(() => {
    void supabase.from("canned_responses").select("id,title,body").order("created_at").then(({ data }) => setCannedResponses((data as CannedResponse[]) ?? []));
  }, []);

  async function loadTicketMessages(ticketId: string) {
    const { data } = await supabase.from("support_ticket_messages").select("id,author_type,message,is_internal,created_at").eq("ticket_id", ticketId).order("created_at");
    setTicketMessages((data as TicketMessage[]) ?? []);
  }

  async function addInternalNote(ticket: TicketRow) {
    if (!internalNote.trim()) return;
    setTicketBusy(true);
    await supabase.from("support_ticket_messages").insert({
      ticket_id: ticket.id, author_user_id: user?.id, author_type: "staff", message: internalNote.trim(), is_internal: true,
    });
    setInternalNote(""); setTicketBusy(false);
    await loadTicketMessages(ticket.id);
  }

  async function openTicket(ticket: TicketRow) {
    if (ticket.status === "open" || ticket.status === "pending") await updateTicket(ticket.id, { status: "in_progress" });
  }

  async function sendTicketReply(ticket: TicketRow) {
    if (!ticketReply.trim()) return;
    setTicketBusy(true);
    const { error } = await supabase.from("support_ticket_messages").insert({
      ticket_id: ticket.id, author_user_id: user?.id, author_type: "staff", message: ticketReply.trim(), is_internal: false,
    });
    if (error) { setMessage(`Reply failed: ${error.message}`); setTicketBusy(false); return; }
    // Status (-> waiting_customer), last_reply_at, first_admin_reply_at are
    // now all set automatically by the ticket_message_transition DB trigger.
    void supabase.functions.invoke("ticket-notify", { body: { ticket_id: ticket.id, kind: "reply" } });
    setTicketReply(""); setTicketBusy(false);
    await Promise.all([load(), loadTicketMessages(ticket.id)]);
  }

  async function resolveTicket(ticket: TicketRow) {
    setTicketBusy(true);
    await updateTicket(ticket.id, { status: "resolved", resolution_summary: resolutionNote.trim() || ticket.resolution_summary || "Resolved." });
    void supabase.functions.invoke("ticket-notify", { body: { ticket_id: ticket.id, kind: "resolved" } });
    setResolutionNote(""); setTicketBusy(false);
  }

  async function changePassword() {
    if (!newPassword || newPassword.length < 8) { setMessage("Password must be at least 8 characters."); return; }
    setUpdatingPassword(true); setMessage(null);
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    setUpdatingPassword(false);
    if (error) { setMessage(`Password update failed: ${error.message}`); return; }
    setNewPassword(""); setMessage("Password updated successfully.");
  }

  function DashboardPage() {
    return (
      <div className="space-y-6">
        <div className="rounded-3xl bg-gradient-to-br from-slate-950 via-slate-900 to-slate-800 text-white p-6 sm:p-8 shadow-xl">
          <div className="max-w-3xl">
            <div className="text-sm text-slate-300 font-semibold">Welcome back</div>
            <h1 className="text-3xl sm:text-4xl font-black mt-2">{staff?.name || user?.email}</h1>
            <p className="text-slate-300 mt-3">This is your role-based workspace. Only tools assigned to your role are visible.</p>
          </div>
        </div>
        {message && <div className="rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">{message}</div>}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          <StatCard label="Open Tasks" value={openTaskCount} icon="✅" note={`${dueTodayTasks} due today`} />
          <StatCard label="Open Tickets" value={openTicketCount} icon="🎧" note={`${urgentTickets} urgent`} />
          <StatCard label="Completed" value={completedCount} icon="🏁" note="Tasks + tickets" />
          <StatCard label="Role" value={role ? STAFF_ROLE_LABELS[role] : "Staff"} icon="🔐" />
        </div>
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          <Section title="Priority Work" subtitle="Tasks due today and urgent tickets.">
            <div className="p-5 space-y-3">
              {dueTodayTasks === 0 && urgentTickets === 0 ? <div className="text-slate-500">No urgent work right now.</div> : null}
              {tasks.filter(t => t.due_date === todayIso && t.status !== "done").slice(0, 4).map(t => <a key={t.id} href="#tasks" className="block rounded-2xl border border-slate-200 p-4 hover:bg-slate-50"><div className="font-bold text-slate-900">{t.title}</div><div className="text-xs text-slate-500 mt-1">Due today • {t.priority}</div></a>)}
              {tickets.filter(t => t.priority === "urgent" && t.status !== "resolved" && t.status !== "closed").slice(0, 4).map(t => <a key={t.id} href="#tickets" className="block rounded-2xl border border-red-200 bg-red-50 p-4"><div className="font-bold text-red-950">{t.subject}</div><div className="text-xs text-red-700 mt-1">Urgent ticket</div></a>)}
            </div>
          </Section>
          <Section title="Recent Notifications" subtitle="Latest unread updates.">
            <div className="p-5 space-y-3">
              {notifications.slice(0, 5).length === 0 ? <div className="text-slate-500">No unread notifications.</div> : notifications.slice(0, 5).map(n => <a key={n.id} href="#notifications" className="block rounded-2xl border border-slate-200 p-4 hover:bg-slate-50"><div className="font-bold text-slate-900">{n.title}</div>{n.body && <div className="text-sm text-slate-500 mt-1">{n.body}</div>}</a>)}
            </div>
          </Section>
        </div>
      </div>
    );
  }

  function TasksPage() {
    if (!hasStaffPermission(role, "tasks")) return <Blocked />;
    return (
      <div className="space-y-6">
        <Section
          title="My Tasks"
          subtitle="Open a task, start work, add updates and submit it for admin review."
          actions={
            <div className="flex flex-col sm:flex-row gap-2">
              <input value={taskSearch} onChange={(e) => setTaskSearch(e.target.value)} placeholder="Search tasks..." className="rounded-2xl border border-slate-200 px-4 py-2 text-sm" />
              <select value={taskFilter} onChange={(e) => setTaskFilter(e.target.value)} className="rounded-2xl border border-slate-200 px-4 py-2 text-sm">
                <option value="open">Open</option><option value="due_today">Due today</option><option value="pending">Assigned</option><option value="in_progress">In progress</option><option value="blocked">Need help</option><option value="done">Completed</option><option value="all">All</option>
              </select>
            </div>
          }
        >
          <div className="divide-y divide-slate-100">
            {filteredTasks.length === 0 ? (
              <div className="p-10 text-center text-slate-500">No tasks found.</div>
            ) : filteredTasks.map(task => (
              <button key={task.id} onClick={() => { if (task.task_type === "queue") { void openQueueWorkspace(task); } else { setSelectedTaskId(task.id); setTaskComment(""); } }} className="w-full text-left p-5 hover:bg-slate-50 transition">
                <div className="flex flex-col xl:flex-row xl:items-start xl:justify-between gap-4">
                  <div>
                    <div className="flex flex-wrap gap-2 mb-2">
                      <Badge tone={task.priority === "urgent" || task.priority === "high" ? "red" : task.priority === "medium" ? "amber" : "slate"}>{task.priority}</Badge>
                      <Badge tone={task.status === "done" ? "green" : task.status === "blocked" ? "red" : task.status === "in_progress" ? "blue" : "purple"}>{taskStatusLabel(task.status)}</Badge>
                      {task.task_type === "queue" && <Badge tone="purple">📋 Queue</Badge>}
                      {task.department && <Badge tone="slate">{task.department}</Badge>}
                    </div>
                    <div className="font-black text-slate-950">{task.title}</div>
                    {task.description && <div className="text-sm text-slate-500 mt-1 line-clamp-2">{task.description}</div>}
                    <div className="text-xs text-slate-400 mt-2">{task.due_date ? `Due ${task.due_date}` : "No due date"}{task.last_staff_update ? ` · Updated ${new Date(task.last_staff_update).toLocaleString()}` : ""}</div>
                  </div>
                  <div className="min-w-[180px]">
                    <div className="text-xs font-bold text-slate-500 mb-1">Progress {task.progress ?? 0}%</div>
                    <div className="h-2 rounded-full bg-slate-100 overflow-hidden"><div className="h-full bg-slate-950" style={{ width: `${task.progress ?? 0}%` }} /></div>
                    <div className="text-xs text-primary-700 font-bold mt-2">Open task →</div>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </Section>

        {tickets.length > 0 && (
          <Section title="🎫 Support Tickets" subtitle="Customer tickets assigned to you — open one to reply and resolve." actions={
            <div className="flex rounded-2xl border border-slate-200 p-1">
              <button onClick={() => setTicketViewFilter("open")} className={`rounded-xl px-3 py-1.5 text-xs font-bold ${ticketViewFilter === "open" ? "bg-slate-950 text-white" : "text-slate-500"}`}>Open</button>
              <button onClick={() => setTicketViewFilter("resolved")} className={`rounded-xl px-3 py-1.5 text-xs font-bold ${ticketViewFilter === "resolved" ? "bg-slate-950 text-white" : "text-slate-500"}`}>Resolved</button>
            </div>
          }>
            <div className="divide-y divide-slate-100">
              {(() => {
                const shown = tickets.filter(t => ticketViewFilter === "open" ? (t.status !== "resolved" && t.status !== "closed") : (t.status === "resolved" || t.status === "closed"));
                if (shown.length === 0) return <div className="p-10 text-center text-slate-500">{ticketViewFilter === "open" ? "No open support tickets." : "No resolved tickets yet."}</div>;
                return shown.map(ticket => (
                <button key={ticket.id} onClick={() => setSelectedTicketId(ticket.id)} className="w-full text-left p-5 hover:bg-slate-50 transition">
                  <div className="flex flex-col xl:flex-row xl:items-start xl:justify-between gap-4">
                    <div>
                      <div className="flex flex-wrap gap-2 mb-2">
                        <Badge tone="purple">Ticket</Badge>
                        <Badge tone={ticket.priority === "urgent" || ticket.priority === "high" ? "red" : ticket.priority === "medium" ? "amber" : "slate"}>{ticket.priority}</Badge>
                        <Badge tone={ticket.status === "resolved" || ticket.status === "closed" ? "green" : ticket.status === "reopened" ? "red" : ticket.status === "in_progress" ? "blue" : "amber"}>{ticket.status.replaceAll("_", " ")}</Badge>
                        {ticketViewFilter === "open" && <Badge tone={ticketSla(ticket).includes("breached") ? "red" : "amber"}>{ticketSla(ticket)}</Badge>}
                      </div>
                      <div className="font-black text-slate-950">{ticket.subject}</div>
                      {ticket.status === "resolved" && ticket.resolution_summary && <div className="text-sm text-emerald-700 mt-1 line-clamp-2">✓ {ticket.resolution_summary}</div>}
                      {ticket.status !== "resolved" && ticket.message && <div className="text-sm text-slate-500 mt-1 line-clamp-2">{ticket.message}</div>}
                    </div>
                    <div className="text-xs text-primary-700 font-bold">{ticketViewFilter === "open" ? "Open & reply →" : "View →"}</div>
                  </div>
                </button>
                ));
              })()}
            </div>
          </Section>
        )}

        {selectedTask && (
          <div className="fixed inset-0 z-50 bg-slate-950/50 backdrop-blur-sm p-4 flex items-center justify-center">
            <div className="w-full max-w-4xl max-h-[92vh] overflow-y-auto rounded-3xl bg-white shadow-2xl border border-slate-200">
              <div className="p-6 border-b border-slate-100 flex items-start justify-between gap-4">
                <div>
                  <div className="flex flex-wrap gap-2 mb-3">
                    <Badge tone={selectedTask.priority === "urgent" || selectedTask.priority === "high" ? "red" : selectedTask.priority === "medium" ? "amber" : "slate"}>{selectedTask.priority}</Badge>
                    <Badge tone={selectedTask.status === "done" ? "green" : selectedTask.status === "blocked" ? "red" : selectedTask.status === "in_progress" ? "blue" : "purple"}>{taskStatusLabel(selectedTask.status)}</Badge>
                  </div>
                  <h2 className="text-2xl font-black text-slate-950">{selectedTask.title}</h2>
                  <p className="text-sm text-slate-500 mt-1">{selectedTask.due_date ? `Due ${selectedTask.due_date}` : "No due date"} · Progress {selectedTask.progress ?? 0}%</p>
                </div>
                <button onClick={() => setSelectedTaskId(null)} className="rounded-2xl border border-slate-200 px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50">Close</button>
              </div>

              <div className="p-6 grid lg:grid-cols-[1fr_320px] gap-6">
                <div className="space-y-5">
                  <div className="rounded-2xl bg-slate-50 border border-slate-100 p-5">
                    <div className="text-xs font-bold uppercase tracking-wide text-slate-500 mb-2">Task brief</div>
                    <p className="text-sm text-slate-700 whitespace-pre-wrap">{selectedTask.description || "No description provided."}</p>
                    {selectedTask.resources && selectedTask.resources.length > 0 && (
                      <div className="flex flex-wrap gap-2 mt-3">
                        {selectedTask.resources.map((r, i) => (
                          <a key={i} href={r.url || "#"} target="_blank" rel="noreferrer" className="rounded-full border border-primary-200 bg-white px-3 py-1 text-xs font-bold text-primary-700 hover:bg-primary-50">🔗 {r.label || r.url}</a>
                        ))}
                      </div>
                    )}
                  </div>
                  {selectedTask.requires_verification && (
                    <div className="rounded-2xl border border-purple-200 bg-purple-50 p-5">
                      <div className="text-xs font-bold uppercase tracking-wide text-purple-700 mb-3">Content draft & AI verification</div>
                      <p className="text-xs text-purple-700 mb-3">This task needs your draft to pass an AI check against the brief and resources before it can be submitted.</p>
                      <textarea value={draftContent} onChange={(e) => setDraftContent(e.target.value)} placeholder="Paste or write your content draft here..." className="w-full rounded-2xl border border-purple-200 px-4 py-3 text-sm min-h-[140px] bg-white" />
                      <button onClick={() => verifyDraft(selectedTask)} disabled={verifying || !draftContent.trim()} className="mt-3 rounded-2xl bg-purple-600 text-white px-4 py-2 text-sm font-bold disabled:opacity-50">{verifying ? "Checking with AI..." : "Verify with AI"}</button>
                      {selectedTask.ai_verification_status && (
                        <div className="mt-4">
                          <Badge tone={selectedTask.ai_verification_status === "pass" ? "green" : selectedTask.ai_verification_status === "fail" ? "red" : "slate"}>
                            {selectedTask.ai_verification_status === "pending" ? "Checking..." : selectedTask.ai_verification_status === "pass" ? "✅ Passed" : "❌ Failed — revise and re-verify"}
                          </Badge>
                          {selectedTask.ai_verification_feedback && <p className="text-sm text-purple-950 mt-2 whitespace-pre-wrap">{selectedTask.ai_verification_feedback}</p>}
                        </div>
                      )}
                    </div>
                  )}
                  {selectedTask.internal_notes && (
                    <div className="rounded-2xl bg-amber-50 border border-amber-100 p-5">
                      <div className="text-xs font-bold uppercase tracking-wide text-amber-700 mb-2">Admin note</div>
                      <p className="text-sm text-amber-900 whitespace-pre-wrap">{selectedTask.internal_notes}</p>
                    </div>
                  )}
                  <div className="rounded-2xl border border-slate-200 p-5">
                    <div className="text-xs font-bold uppercase tracking-wide text-slate-500 mb-3">Work updates & proof notes</div>
                    <div className="min-h-[90px] rounded-2xl bg-slate-50 border border-slate-100 p-4 text-sm text-slate-700 whitespace-pre-wrap">{selectedTask.staff_notes || "No updates yet. Add your first update below."}</div>
                    <textarea value={taskComment} onChange={(e) => setTaskComment(e.target.value)} placeholder="Write what you checked, proof links, blockers, customer response, or final result..." className="mt-4 w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm min-h-[100px]" />
                    <button onClick={() => addTaskComment(selectedTask)} disabled={savingId === selectedTask.id || !taskComment.trim()} className="mt-3 rounded-2xl bg-slate-950 text-white px-4 py-2 text-sm font-bold disabled:opacity-50">Add update</button>
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="rounded-2xl border border-slate-200 p-4">
                    <div className="text-xs font-bold uppercase tracking-wide text-slate-500 mb-3">Quick actions</div>
                    <div className="grid gap-2">
                      <button onClick={() => quickTaskAction(selectedTask, "in_progress", Math.max(selectedTask.progress ?? 0, 25))} disabled={savingId === selectedTask.id} className="rounded-2xl bg-blue-600 text-white px-4 py-3 text-sm font-bold">Start work</button>
                      <button onClick={() => quickTaskAction(selectedTask, "blocked", selectedTask.progress ?? 25)} disabled={savingId === selectedTask.id} className="rounded-2xl bg-amber-500 text-white px-4 py-3 text-sm font-bold">Need help</button>
                      {!selectedTask.requires_verification && (
                        <button onClick={() => quickTaskAction(selectedTask, "done", 100)} disabled={savingId === selectedTask.id} className="rounded-2xl bg-emerald-600 text-white px-4 py-3 text-sm font-bold">Submit for review</button>
                      )}
                    </div>
                  </div>
                  <WorkspaceTools itemType="task" itemId={selectedTask.id} performedBy={staff?.id} />
                  <div className="rounded-2xl bg-emerald-50 border border-emerald-100 p-4 text-xs text-emerald-800">
                    <div className="font-black uppercase tracking-wide mb-2">Before submit checklist</div>
                    <ul className="space-y-1 list-disc pl-4">
                      <li>Open and verify the related customer/user data if this task needs it.</li>
                      <li>Add a clear work update with what you checked.</li>
                      <li>Paste proof links or screenshots in the update box if needed.</li>
                    </ul>
                  </div>
                  <div className="rounded-2xl border border-slate-200 p-4">
                    <div className="text-xs font-bold uppercase tracking-wide text-slate-500 mb-3">Manual progress</div>
                    <select value={selectedTask.status} onChange={(e) => updateTask(selectedTask.id, { status: e.target.value })} disabled={savingId === selectedTask.id} className="w-full rounded-2xl border border-slate-200 px-3 py-2 text-sm mb-2">
                      {taskStatuses.map(status => <option key={status} value={status}>{taskStatusLabel(status)}</option>)}
                    </select>
                    <select value={String(selectedTask.progress ?? 0)} onChange={(e) => updateTask(selectedTask.id, { progress: Number(e.target.value) })} disabled={savingId === selectedTask.id} className="w-full rounded-2xl border border-slate-200 px-3 py-2 text-sm">
                      {[0,25,50,75,100].map(v => <option key={v} value={v}>{v}%</option>)}
                    </select>
                  </div>
                  <div className="rounded-2xl border border-slate-200 p-4">
                    <div className="text-xs font-bold uppercase tracking-wide text-slate-500 mb-3">Submission proof</div>
                    {selectedTask.requires_verification && selectedTask.ai_verification_status !== "pass" && (
                      <p className="text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-xl p-2 mb-2">Pass AI verification above before you can submit.</p>
                    )}
                    <input value={submissionUrl} onChange={(e) => setSubmissionUrl(e.target.value)} placeholder="Proof URL (link, doc, published post...)" className="w-full rounded-2xl border border-slate-200 px-3 py-2 text-sm mb-2" />
                    <input value={submissionScreenshotUrl} onChange={(e) => setSubmissionScreenshotUrl(e.target.value)} placeholder="Screenshot URL (optional)" className="w-full rounded-2xl border border-slate-200 px-3 py-2 text-sm mb-2" />
                    <textarea value={submissionNotes} onChange={(e) => setSubmissionNotes(e.target.value)} placeholder="Submission notes (optional)" className="w-full rounded-2xl border border-slate-200 px-3 py-2 text-sm min-h-[70px] mb-2" />
                    <button
                      onClick={() => submitTaskWithProof(selectedTask)}
                      disabled={submittingProof || savingId === selectedTask.id || Boolean(selectedTask.requires_verification && selectedTask.ai_verification_status !== "pass")}
                      className="w-full rounded-2xl bg-emerald-600 text-white px-4 py-3 text-sm font-bold disabled:opacity-50"
                    >
                      {submittingProof ? "Submitting..." : "Submit with proof"}
                    </button>
                    {selectedTask.submitted_at && <p className="text-xs text-slate-400 mt-2">Last submitted {new Date(selectedTask.submitted_at).toLocaleString()}</p>}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  function TicketsPage() {
    if (!hasStaffPermission(role, "tickets")) return <Blocked />;
    return <Section title="Support Tickets" subtitle="Handle assigned customer issues." actions={<div className="flex flex-col sm:flex-row gap-2"><input value={ticketSearch} onChange={(e) => setTicketSearch(e.target.value)} placeholder="Search tickets..." className="rounded-2xl border border-slate-200 px-4 py-2 text-sm"/><select value={ticketFilter} onChange={(e) => setTicketFilter(e.target.value)} className="rounded-2xl border border-slate-200 px-4 py-2 text-sm"><option value="open">Open</option><option value="urgent">Urgent</option><option value="pending">Pending</option><option value="resolved">Resolved</option><option value="closed">Closed</option><option value="all">All</option></select></div>}>
      <div className="divide-y divide-slate-100">{filteredTickets.length === 0 ? <div className="p-10 text-center text-slate-500">No support tickets found.</div> : filteredTickets.map(ticket => (
        <button key={ticket.id} onClick={() => setSelectedTicketId(ticket.id)} className="w-full text-left p-5 hover:bg-slate-50 transition">
          <div className="flex flex-col xl:flex-row xl:items-start xl:justify-between gap-4">
            <div>
              <div className="flex flex-wrap gap-2 mb-2">
                <Badge tone={ticket.priority === "urgent" || ticket.priority === "high" ? "red" : ticket.priority === "medium" ? "amber" : "slate"}>{ticket.priority}</Badge>
                <Badge tone={ticket.status === "resolved" || ticket.status === "closed" ? "green" : "blue"}>{ticket.status.replaceAll("_", " ")}</Badge>
                <Badge tone={ticket.first_admin_reply_at ? "green" : ticketSla(ticket).includes("breached") ? "red" : "amber"}>{ticketSla(ticket)}</Badge>
              </div>
              <div className="text-xs font-bold text-indigo-600">{ticket.ticket_number || ticket.id.slice(0,8)}</div>
              <div className="font-black text-slate-950">{ticket.subject}</div>
              {ticket.message && <div className="text-sm text-slate-500 mt-1 line-clamp-2">{ticket.message}</div>}
              <div className="text-xs text-slate-400 mt-2">Created {new Date(ticket.created_at).toLocaleString()}</div>
            </div>
            <div className="text-xs text-primary-700 font-bold">Open ticket →</div>
          </div>
        </button>
      ))}</div>
    </Section>;
  }

  function TicketWorkspace() {
    if (!selectedTicket) return null;
    const ticket = selectedTicket;
    const closed = ticket.status === "resolved" || ticket.status === "closed";
    const timeline = [
      ...ticketMessages.map(m => ({ kind: "message" as const, at: m.created_at, data: m })),
    ].sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());

    return (
      <div className="fixed inset-0 z-50 bg-white flex flex-col">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-6 py-4">
          <div>
            <div className="flex flex-wrap gap-2 mb-2">
              <Badge tone={ticket.priority === "urgent" || ticket.priority === "high" ? "red" : ticket.priority === "medium" ? "amber" : "slate"}>{ticket.priority}</Badge>
              <Badge tone={ticket.status === "reopened" ? "red" : closed ? "green" : "blue"}>{ticket.status.replaceAll("_", " ")}</Badge>
              {!closed && <Badge tone={ticketSla(ticket).includes("breached") ? "red" : "amber"}>{`⏱ ${ticketSla(ticket)}`}</Badge>}
            </div>
            <h2 className="text-xl font-black text-slate-950">{ticket.subject}</h2>
            <p className="text-xs text-slate-500 mt-1">{ticket.ticket_number || ticket.id.slice(0, 8)} · Created {new Date(ticket.created_at).toLocaleString()}</p>
          </div>
          <button onClick={() => setSelectedTicketId(null)} className="rounded-2xl border border-slate-200 px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50">✕ Close</button>
        </div>

        {/* 3-column body */}
        <div className="flex-1 overflow-hidden grid lg:grid-cols-[240px_1fr_300px]">
          {/* LEFT: customer context */}
          <div className="hidden lg:block overflow-y-auto border-r border-slate-100 p-4 space-y-4 bg-slate-50">
            <div className="text-xs font-black uppercase tracking-wide text-slate-400">Customer</div>
            <div>
              <div className="font-bold text-slate-900 text-sm">{customerContext?.business_name || "—"}</div>
              <div className="text-xs text-slate-500 break-all">{customerContext?.email || "—"}</div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-xl bg-white border border-slate-200 p-2.5"><div className="text-[10px] font-bold uppercase text-slate-400">Past tickets</div><div className="text-lg font-black text-slate-950">{customerContext?.pastTicketCount ?? "—"}</div></div>
              <div className="rounded-xl bg-white border border-slate-200 p-2.5"><div className="text-[10px] font-bold uppercase text-slate-400">Invoices</div><div className="text-lg font-black text-slate-950">{customerContext?.invoiceCount ?? "—"}</div></div>
            </div>
            <div className="rounded-xl bg-white border border-slate-200 p-2.5"><div className="text-[10px] font-bold uppercase text-slate-400">Category</div><div className="text-sm font-bold text-slate-800 capitalize">{ticket.category || "general"}</div></div>
          </div>

          {/* CENTER: timeline + reply */}
          <div className="flex flex-col overflow-hidden">
            <div className="flex-1 overflow-y-auto p-5 space-y-3">
              <div className="rounded-2xl bg-slate-50 border border-slate-200 p-3 text-sm"><span className="font-bold text-slate-950">Customer: </span>{ticket.message || ticket.subject}</div>
              {timeline.length === 0 && <p className="text-center text-xs text-slate-400 py-6">No replies yet.</p>}
              {timeline.map(item => {
                const m = item.data;
                if (m.is_internal) {
                  return <div key={m.id} className="rounded-2xl bg-amber-50 border border-amber-200 p-3 text-sm max-w-[85%]"><div className="text-[10px] uppercase font-bold text-amber-600 mb-1">🔒 Internal note — {m.author_type}</div>{m.message}</div>;
                }
                return (
                  <div key={m.id} className={`rounded-2xl p-3 text-sm max-w-[85%] ${m.author_type === "customer" ? "bg-white border border-slate-200" : m.author_type === "bot" ? "bg-purple-50 border border-purple-100 ml-auto italic" : "bg-indigo-600 text-white ml-auto"}`}>
                    <div className="text-[10px] uppercase font-bold opacity-70 mb-1">{m.author_type} · {new Date(m.created_at).toLocaleTimeString()}</div>
                    {m.message}
                  </div>
                );
              })}
              {customerTyping && <div className="text-xs text-slate-400 italic px-1">Customer is typing...</div>}
            </div>
            {!closed && (
              <div className="border-t border-slate-100 p-4 space-y-2">
                {cannedResponses.length > 0 && (
                  <select className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs" value="" onChange={(e) => { const picked = cannedResponses.find(c => c.id === e.target.value); if (picked) setTicketReply((cur) => cur ? `${cur}\n\n${picked.body}` : picked.body); }}>
                    <option value="">💬 Insert canned response...</option>
                    {cannedResponses.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}
                  </select>
                )}
                <textarea value={ticketReply} onChange={(e) => { setTicketReply(e.target.value); broadcastStaffTyping(); }} placeholder="Reply to customer..." className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm min-h-[70px]" />
                <div className="flex flex-wrap gap-2">
                  <button onClick={() => void sendTicketReply(ticket)} disabled={ticketBusy || !ticketReply.trim()} className="rounded-2xl bg-indigo-600 text-white px-4 py-2 text-sm font-bold disabled:opacity-50">Send reply</button>
                  {(ticket.status === "open" || ticket.status === "pending") && <button onClick={() => void openTicket(ticket)} disabled={ticketBusy} className="rounded-2xl bg-blue-600 text-white px-4 py-2 text-sm font-bold">Start work</button>}
                </div>
                <div className="flex gap-2 pt-2 border-t border-slate-100">
                  <input value={internalNote} onChange={(e) => setInternalNote(e.target.value)} placeholder="🔒 Internal note (staff only, customer never sees this)..." className="flex-1 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs" />
                  <button onClick={() => void addInternalNote(ticket)} disabled={ticketBusy || !internalNote.trim()} className="rounded-xl bg-amber-500 text-white px-3 py-2 text-xs font-bold disabled:opacity-50">Add note</button>
                </div>
              </div>
            )}
          </div>

          {/* RIGHT: actions + tools */}
          <div className="overflow-y-auto border-l border-slate-100 p-4 space-y-4">
            {!closed ? (
              <div className="rounded-2xl border border-slate-200 p-4">
                <div className="text-xs font-bold uppercase tracking-wide text-slate-500 mb-3">Resolve &amp; close</div>
                <textarea value={resolutionNote} onChange={(e) => setResolutionNote(e.target.value)} placeholder="Resolution summary (sent to customer)..." className="w-full rounded-2xl border border-slate-200 px-3 py-2 text-sm min-h-[80px] mb-2" />
                <button onClick={() => void resolveTicket(ticket)} disabled={ticketBusy} className="w-full rounded-2xl bg-emerald-600 text-white px-4 py-3 text-sm font-bold disabled:opacity-50">Submit &amp; close</button>
              </div>
            ) : (
              <div className="rounded-2xl bg-emerald-50 border border-emerald-100 p-4 text-sm text-emerald-800"><b>Resolved.</b><br/>{ticket.resolution_summary}</div>
            )}
            <div className="rounded-2xl bg-slate-50 border border-slate-100 p-4 text-xs text-slate-500">SLA target: {ticket.sla_target_minutes ? `${ticket.sla_target_minutes} min` : "default"}. Customer gets an email on every reply and on resolve.</div>
            <WorkspaceTools itemType="ticket" itemId={ticket.id} performedBy={staff?.id} />
          </div>
        </div>
      </div>
    );
  }


  function CommunicationPage() {
    if (!hasStaffPermission(role, "communication")) return <Blocked />;
    return (
      <CommunicationCenter
        actorName={staff?.name || user?.email || "Staff"}
        actorRole={role ? STAFF_ROLE_LABELS[role] : "Staff"}
        canManageChannels={role === "full_access"}
      />
    );
  }

  function NotificationsPage() {
    return <Section title="Notifications" subtitle="Unread role and task updates." actions={notifications.length > 0 && <button onClick={markAllNotificationsRead} className="rounded-2xl bg-slate-950 text-white px-4 py-2 text-sm font-bold">Mark all read</button>}>
      <div className="divide-y divide-slate-100">{notifications.length === 0 ? <div className="p-10 text-center text-slate-500">No unread notifications.</div> : notifications.map(n => <div key={n.id} className="p-5 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 hover:bg-slate-50 cursor-pointer" onClick={() => { markNotificationRead(n.id); if (n.metadata?.ticket_id || n.type.includes("ticket")) { setSelectedTicketId(n.metadata!.ticket_id as string); window.location.hash = "tasks"; } else if (n.metadata?.task_id || n.type.includes("task")) { setSelectedTaskId(n.metadata!.task_id as string); window.location.hash = "tasks"; } else if (n.metadata?.channel_id || n.type === "team_message") { window.location.hash = "communication"; } }}><div><div className="font-black text-slate-950">{n.title}</div>{n.body && <div className="text-sm text-slate-500 mt-1">{n.body}</div>}<div className="text-xs text-slate-400 mt-2">{new Date(n.created_at).toLocaleString()} • {n.type.replace("_", " ")}</div></div><button onClick={(e) => { e.stopPropagation(); markNotificationRead(n.id); }} className="rounded-2xl border border-slate-200 px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50">Mark read</button></div>)}</div>
    </Section>;
  }

  function FinancePage() {
    if (!hasStaffPermission(role, "finance")) return <Blocked />;
    return <Section title="Finance Workspace" subtitle="Finance entries visible to finance roles."><div className="p-5"><div className="mb-5"><StatCard label="Visible Income" value={`₹${incomeTotal.toFixed(2)}`} icon="💰" /></div><div className="divide-y divide-slate-100 rounded-2xl border border-slate-200 overflow-hidden">{finance.length === 0 ? <div className="p-8 text-slate-500">No finance entries.</div> : finance.map(row => <div key={row.id} className="p-4 flex items-center justify-between"><div><div className="font-bold text-slate-950">{row.title}</div><div className="text-xs text-slate-500">{row.source} • {row.status}</div></div><div className="font-black">{row.currency} {Number(row.amount).toFixed(2)}</div></div>)}</div></div></Section>;
  }

  function ReportsPage() {
    return <Section title="Reports" subtitle="Staff productivity summary."><div className="p-5 grid grid-cols-1 md:grid-cols-3 gap-4"><StatCard label="Tasks Done" value={completedTaskCount} icon="🏁" /><StatCard label="Open Work" value={openTaskCount + openTicketCount} icon="📌" /><StatCard label="Urgent Items" value={urgentTickets + dueTodayTasks} icon="⚠️" /></div></Section>;
  }

  function ProfilePage() {
    return <Section title="My Profile" subtitle="Your staff identity and security."><div className="p-5 grid grid-cols-1 xl:grid-cols-2 gap-5"><div className="rounded-3xl border border-slate-200 p-5 bg-slate-50"><div className="w-16 h-16 rounded-3xl bg-slate-950 text-white flex items-center justify-center font-black text-xl mb-4">{(staff?.name || user?.email || "S").slice(0,1).toUpperCase()}</div><div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm"><div><div className="text-xs uppercase font-bold text-slate-500">Name</div><div className="font-bold text-slate-950">{staff?.name || "Not set"}</div></div><div><div className="text-xs uppercase font-bold text-slate-500">Email</div><div className="font-bold text-slate-950 break-all">{staff?.email || user?.email}</div></div><div><div className="text-xs uppercase font-bold text-slate-500">Role</div><div className="font-bold text-slate-950">{role ? STAFF_ROLE_LABELS[role] : "Staff"}</div></div><div><div className="text-xs uppercase font-bold text-slate-500">Status</div><div className="font-bold text-emerald-700">{staff?.status || "active"}</div></div></div></div><div className="rounded-3xl border border-slate-200 p-5"><label className="block text-xs font-bold text-slate-500 uppercase mb-2">Change password</label><PasswordField value={newPassword} onChange={(e) => setNewPassword(e.target.value)} className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm" placeholder="New password, min 8 characters"/><button onClick={changePassword} disabled={updatingPassword || newPassword.length < 8} className="mt-3 w-full rounded-2xl bg-slate-950 text-white py-3 text-sm font-bold disabled:opacity-50">{updatingPassword ? "Updating..." : "Update Password"}</button></div></div></Section>;
  }

  function SettingsPage() {
    return <Section title="Settings" subtitle="Staff workspace preferences."><div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-4"><div className="rounded-2xl border border-slate-200 p-4"><div className="font-bold text-slate-950">Notifications</div><p className="text-sm text-slate-500 mt-1">Task and ticket alerts are enabled by default.</p></div><div className="rounded-2xl border border-slate-200 p-4"><div className="font-bold text-slate-950">Security</div><p className="text-sm text-slate-500 mt-1">Use profile section to update your password.</p></div></div></Section>;
  }

  function UsersPage() { return hasStaffPermission(role, "users") ? <Section title="Users" subtitle="Assigned customer support workspace."><div className="p-10 text-center text-slate-500">User support tools will show assigned customers here.</div></Section> : <Blocked />; }
  function Blocked() { return <div className="rounded-3xl bg-white border border-slate-200 p-10 text-center"><div className="text-4xl mb-3">🔒</div><h2 className="text-xl font-black text-slate-950">Access not available</h2><p className="text-slate-500 mt-2">This section is hidden for your role.</p></div>; }

  function QueueWorkspace() {
    const task = queueTaskId ? tasks.find((t) => t.id === queueTaskId) ?? null : null;
    if (!task) return null;
    const fields = task.queue_field_schema || [];
    const counts = {
      pending: queueItemsState.filter((i) => i.status === "pending").length,
      red: queueItemsState.filter((i) => i.status === "red").length,
      orange: queueItemsState.filter((i) => i.status === "orange").length,
      green: queueItemsState.filter((i) => i.status === "green").length,
    };
    const allDone = queueItemsState.length > 0 && counts.pending === 0;
    const shown = queueItemsState.filter((i) => queueItemFilter === "all" ? true : i.status === queueItemFilter);
    const selectedItem = selectedQueueItemId ? queueItemsState.find((i) => i.id === selectedQueueItemId) ?? null : null;
    const canMark = Boolean(queueDraft.notes.trim() || queueDraft.screenshotUrl.trim() || queueDraft.recordingUrl.trim());

    return (
      <div className="fixed inset-0 z-50 bg-white flex flex-col">
        <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-6 py-4">
          <div>
            <div className="flex flex-wrap gap-2 mb-2">
              <Badge tone="purple">📋 Lead / Item Queue</Badge>
              {task.department && <Badge tone="slate">{task.department}</Badge>}
            </div>
            <h2 className="text-xl font-black text-slate-950">{task.title}</h2>
          </div>
          <button
            onClick={async () => {
              if (queueSession && !allDone) { if (!confirm("End this session now? Remaining items stay pending for next time.")) return; }
              if (queueSession) await endQueueSession(task, allDone);
              setQueueTaskId(null); setSelectedQueueItemId(null);
            }}
            className="rounded-2xl border border-slate-200 px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50"
          >
            ✕ Close
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          <div className="max-w-4xl mx-auto p-6 space-y-5">
            <div className="rounded-2xl bg-slate-50 border border-slate-100 p-5">
              <p className="text-xs font-bold uppercase tracking-wide text-slate-500 mb-2">Guide — what to do</p>
              <p className="text-sm text-slate-700 whitespace-pre-wrap">{task.description || "No guide provided."}</p>
              {task.resources && task.resources.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-3">
                  {task.resources.map((r, i) => <a key={i} href={r.url || "#"} target="_blank" rel="noreferrer" className="rounded-full border border-primary-200 bg-white px-3 py-1 text-xs font-bold text-primary-700 hover:bg-primary-50">🔗 {r.label || r.url}</a>)}
                </div>
              )}
            </div>

            {!queueSession ? (
              <div className="rounded-2xl border-2 border-dashed border-purple-200 bg-purple-50 p-6 text-center">
                <p className="text-sm font-bold text-purple-900">Total items: {queueItemsState.length}</p>
                <p className="text-xs text-purple-600 mt-1 mb-4">Starting will ask your browser to share your screen and record this session (desktop browser required — Chrome/Edge).</p>
                <button onClick={() => startQueueSession(task)} className="rounded-2xl bg-purple-600 text-white px-6 py-3 text-sm font-black">▶ Start</button>
              </div>
            ) : (
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 flex items-center justify-between flex-wrap gap-2">
                <p className="text-sm font-bold text-emerald-800">
                  {recordingState === "recording" && "🔴 Session active — screen recording in progress"}
                  {recordingState === "requesting" && "🟡 Session active — waiting for screen-share permission..."}
                  {recordingState === "denied" && "🟢 Session active — recording permission denied, working without recording"}
                  {recordingState === "unsupported" && "🟢 Session active — recording not supported on this device"}
                  {recordingState === "idle" && "🟢 Session active"}
                </p>
                <button onClick={() => endQueueSession(task, false)} className="rounded-xl border border-emerald-300 bg-white px-3 py-1.5 text-xs font-bold text-emerald-700">Pause / End session</button>
              </div>
            )}

            {allDone && (
              <div className="rounded-2xl border border-emerald-300 bg-emerald-50 p-5 text-center">
                <p className="text-lg font-black text-emerald-800">✅ All items complete</p>
                <p className="text-sm text-emerald-700 mt-1">Great work — every item in this queue has been marked.</p>
              </div>
            )}

            <div>
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm font-black text-slate-950">Items</p>
                <div className="flex flex-wrap gap-1.5">
                  {([["all", "All", counts.pending + counts.red + counts.orange + counts.green, "bg-slate-950 text-white"], ["pending", "⚪ Pending", counts.pending, "bg-slate-100 text-slate-600"], ["red", "🔴 Red", counts.red, "bg-red-50 text-red-700"], ["orange", "🟠 Maybe Later", counts.orange, "bg-orange-50 text-orange-700"], ["green", "🟢 Converted", counts.green, "bg-emerald-50 text-emerald-700"]] as const).map(([key, label, count, cls]) => (
                    <button key={key} onClick={() => setQueueItemFilter(key)} className={`rounded-full px-3 py-1 text-xs font-bold border ${queueItemFilter === key ? cls + " ring-2 ring-offset-1 ring-purple-300" : "bg-white text-slate-500 border-slate-200"}`}>{label} ({count})</button>
                  ))}
                </div>
              </div>
              <div className="space-y-2">
                {shown.length === 0 && <div className="rounded-2xl border border-slate-100 p-8 text-center text-sm text-slate-400">No items in this filter.</div>}
                {shown.map((item) => {
                  const dot = item.status === "red" ? "bg-red-500" : item.status === "orange" ? "bg-orange-400" : item.status === "green" ? "bg-emerald-500" : "bg-slate-300";
                  const primary = fields[0] ? item.data[fields[0].key] : null;
                  return (
                    <button key={item.id} onClick={() => openQueueItem(task, item)} className="w-full text-left rounded-2xl border border-slate-200 p-4 flex items-center justify-between gap-3 hover:bg-slate-50">
                      <div className="flex items-center gap-3 min-w-0">
                        <span className={`w-3 h-3 rounded-full shrink-0 ${dot}`} />
                        <div className="min-w-0">
                          <p className="font-bold text-slate-950 truncate">{primary || "(no name)"}</p>
                          <p className="text-xs text-slate-500 truncate">{fields.slice(1).map((f) => item.data[f.key]).filter(Boolean).join(" · ")}</p>
                        </div>
                      </div>
                      <span className="text-xs font-bold text-primary-700 shrink-0">Open →</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        {selectedItem && (
          <div className="fixed inset-0 z-[60] bg-slate-950/50 backdrop-blur-sm p-4 flex items-center justify-center" onClick={() => setSelectedQueueItemId(null)}>
            <div className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-3xl bg-white shadow-2xl border border-slate-200 p-6" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-start justify-between mb-4">
                <h3 className="text-lg font-black text-slate-950">Item detail</h3>
                <button onClick={() => setSelectedQueueItemId(null)} className="text-slate-400 hover:text-slate-700">✕</button>
              </div>
              <div className="rounded-2xl bg-slate-50 border border-slate-100 p-4 mb-4 space-y-1.5">
                {fields.map((f) => selectedItem.data[f.key] ? (
                  <div key={f.key} className="flex justify-between text-sm gap-3"><span className="text-slate-500 font-semibold">{f.label}</span><span className="text-slate-950 font-bold text-right break-all">{selectedItem.data[f.key]}</span></div>
                ) : null)}
              </div>

              <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Notes — what happened</label>
              <textarea value={queueDraft.notes} onChange={(e) => setQueueDraft({ ...queueDraft, notes: e.target.value })} placeholder="What did you say, what did they say..." className="w-full rounded-2xl border border-slate-200 px-3 py-2 text-sm min-h-[80px] mb-3" />

              <div className="grid grid-cols-2 gap-2 mb-3">
                <label className="flex items-center justify-center gap-1.5 rounded-xl border border-dashed border-slate-300 px-2 py-2.5 text-xs font-semibold text-slate-600 cursor-pointer hover:bg-slate-50 text-center">
                  {queueFileUploading === "screenshot" ? "Uploading..." : queueDraft.screenshotUrl ? "✅ Chat screenshot added" : "💬 Upload chat screenshot"}
                  <input type="file" accept="image/*" className="hidden" disabled={queueFileUploading !== null} onChange={async (e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) await uploadQueueProofFile(f, "screenshot"); }} />
                </label>
                <label className="flex items-center justify-center gap-1.5 rounded-xl border border-dashed border-slate-300 px-2 py-2.5 text-xs font-semibold text-slate-600 cursor-pointer hover:bg-slate-50 text-center">
                  {queueFileUploading === "recording" ? "Uploading..." : queueDraft.recordingUrl ? "✅ Call recording added" : "📞 Upload call recording"}
                  <input type="file" accept="audio/*,video/*" className="hidden" disabled={queueFileUploading !== null} onChange={async (e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) await uploadQueueProofFile(f, "recording"); }} />
                </label>
              </div>

              {!canMark && <p className="text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-xl p-2 mb-3">Add notes, a chat screenshot, or a call recording before you can mark this item.</p>}

              <div className="grid grid-cols-3 gap-2">
                <button disabled={!canMark || queueItemSaving} onClick={() => markQueueItem(task, selectedItem, "red")} className="rounded-2xl bg-red-600 text-white py-3 text-sm font-black disabled:opacity-40">🔴 Red</button>
                <button disabled={!canMark || queueItemSaving} onClick={() => markQueueItem(task, selectedItem, "orange")} className="rounded-2xl bg-orange-500 text-white py-3 text-sm font-black disabled:opacity-40">🟠 Later</button>
                <button disabled={!canMark || queueItemSaving} onClick={() => markQueueItem(task, selectedItem, "green")} className="rounded-2xl bg-emerald-600 text-white py-3 text-sm font-black disabled:opacity-40">🟢 Green</button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  function ActivePage() {
    if (active === "tasks") return TasksPage();
    if (active === "tickets") return TicketsPage();
    if (active === "users") return UsersPage();
    if (active === "finance") return FinancePage();
    if (active === "reports") return ReportsPage();
    if (active === "communication") return CommunicationPage();
    if (active === "notifications") return NotificationsPage();
    if (active === "profile") return ProfilePage();
    if (active === "settings") return SettingsPage();
    return DashboardPage();
  }

  return (
    <>
      {ActivePage()}
      {TicketWorkspace()}
      {QueueWorkspace()}
    </>
  );
}
