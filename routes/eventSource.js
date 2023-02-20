import express from "express";
const router = express.Router();
function getRandomInt(min, max) {
  min = Math.ceil(min);
  max = Math.floor(max);
  return Math.floor(Math.random() * (max - min) + min); // The maximum is exclusive and the minimum is inclusive
}
let loop;
function eventsHandler(request, response, next) {
  let clients = [];
  response.statusCode = 200;
  response.setHeader("Access-Control-Allow-Origin", "*");
  response.setHeader("Content-Type", "text/event-stream");
  response.setHeader("connection", "keep-alive");
  response.setHeader("Cache-Control", "no-cache");
  response.setHeader("Transfer-Encoding", "chunked");
  //   response.setHeader("X-Accel-Buffering", "no");
  const data = `data: ${JSON.stringify({ blah: getRandomInt(1, 100) })}\n\n`;
  response.write(data);
  loop = setInterval(() => {
    const r = getRandomInt(1, 100);
    console.log(`sending ${r}`);
    const data = `data: ${JSON.stringify({ blah: r })}\n\n`;
    response.write(data);
  }, 10000);
  //   response.end();
  const clientId = Date.now();
  const newClient = { id: clientId, response };
  clients.push(newClient);
  request.on("close", () => {
    console.log(`${clientId} Connection closed`);
    clients = clients.filter(client => client.id !== clientId);
    if (!clients.length) {
      console.log("terminating...");
      response.end();
      clearInterval(loop);
    }
  });
}
router.get("/eventSource", eventsHandler);

export default router;
