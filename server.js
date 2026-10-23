// Demo server: serves the repo (demos + dist) and a Server-Sent Events stream on one origin.
//   npm run build && npm run demo-server
//   open http://127.0.0.1:8081/demos/workerstuff/
import http from "http";
import { fileURLToPath } from "url";
import express from "express";
import eventSource from "./routes/eventSource.js";
import cors from "cors";
import bodyParser from "body-parser";

const root = fileURLToPath(new URL(".", import.meta.url));
const app = express();
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// routes
app.use(eventSource);
app.use(express.static(root));

// Server instance
const httpServer = http.createServer(app);
const httpPort = Number(process.env.PORT) || 8081;
const httpHost = process.env.HOST || "0.0.0.0";
httpServer.listen(httpPort, httpHost, () => {
  console.log(
    `server is running @ http://127.0.0.1:${httpPort}/demos/workerstuff/`
  );
});
