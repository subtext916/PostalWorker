import http from "http";
import express from "express";
import eventSource from "./routes/eventSource.js";
import cors from "cors";
import bodyParser from "body-parser";
var app = express();
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static("public"));

// routes
app.get("/eventSource", eventSource);

// Server instance
const httpServer = http.createServer(app);
const httpPort = 8081;
httpServer.listen(httpPort, () => {
  console.log(`server is running @ port: ${httpPort}`);
});
