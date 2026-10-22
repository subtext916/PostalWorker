import express from "express";
const router = express.Router();

function getRandomInt(min, max) {
  min = Math.ceil(min);
  max = Math.floor(max);
  return Math.floor(Math.random() * (max - min) + min); // max exclusive, min inclusive
}

let nextClientId = 1;

// Each connection owns its own timer. (Previously one module-level `loop` was
// shared: when an older connection closed it cleared the newest connection's
// timer, so the live stream went silent, and the old timer kept writing to a
// closed response.)
function eventsHandler(request, response) {
  const clientId = nextClientId++;
  response.writeHead(200, {
    "Content-Type": "text/event-stream",
    // no-transform: stops gzip middleware (e.g. CRA's dev-server proxy) from
    // buffering the stream until it closes
    "Cache-Control": "no-cache, no-transform",
    "Access-Control-Allow-Origin": "*",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  response.flushHeaders();

  const send = () => {
    const r = getRandomInt(1, 100);
    console.log(`#${clientId} sending ${r}`);
    response.write(`data: ${JSON.stringify({ blah: r })}\n\n`);
  };
  send();
  const timer = setInterval(send, 10000);

  request.on("close", () => {
    console.log(`#${clientId} connection closed`);
    clearInterval(timer);
    response.end();
  });
}

router.get("/eventSource", eventsHandler);

export default router;
