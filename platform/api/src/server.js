import express from "express";
import cors from "cors";

const app = express();
const port = Number(process.env.PORT || 3307);

app.use(cors({
  origin: true,
  credentials: true,
}));
app.use(express.json({ limit: "20mb" }));

app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    app: "crm_certifast_api",
    mode: process.env.NODE_ENV || "development",
    now: new Date().toISOString(),
  });
});

app.get("/meta", (_req, res) => {
  res.json({
    name: "crm_certifast",
    stage: "foundation",
    architecture: "docker-fullstack",
    modules: [
      "auth",
      "partners",
      "imports",
      "commissions",
      "renewals"
    ],
  });
});

app.listen(port, () => {
  console.log(`crm_certifast_api listening on ${port}`);
});
