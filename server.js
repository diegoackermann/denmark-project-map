// server.js — serves static files, proxies /api to Python FastAPI backend
const express = require("express");
const { createProxyMiddleware } = require("http-proxy-middleware");
const path = require("path");
const app = express();
app.use("/api", createProxyMiddleware({ target: "http://localhost:8000", changeOrigin: true }));
app.use(express.static(path.join(__dirname)));
app.listen(5000, "0.0.0.0", () => console.log("listening on 5000"));
