export default async function handler(req, res) {
  const { from, to } = req.query;

  if (!from || !to) {
    return res.status(400).json({ error: "Missing currency parameters." });
  }

  try {
    const response = await fetch(
      `https://api.frankfurter.app/latest?from=${from}&to=${to}`
    );

    const data = await response.json();

    return res.status(200).json(data);
  } catch (err) {
    return res.status(500).json({ error: "Unable to fetch exchange rate." });
  }
}