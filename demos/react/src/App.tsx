import React, { useEffect, useState } from "react";
import Button from "@mui/material/Button";
import { usePostalWorker, usePostBox } from "./usePostalWorker";

/** Everything this demo sends, so the compiler checks every call. */
type DemoSchema = {
  boxes: { input: string; clicked: number; randomNumber: number };
  packages: { video: Blob };
};

function App() {
  const postal = usePostalWorker<DemoSchema>({ workerUrl: "./PostalSharedWorker.js" });

  const input = usePostBox(postal, "input");
  const clicked = usePostBox(postal, "clicked");
  // updated inside the worker, see ../public/workerSubscribeDemo.js
  const random = usePostBox(postal, "randomNumber");
  const [videoUrl, setVideoUrl] = useState<string | null>(null);

  // the video is fetched and packed inside the worker, see ../public/videoCacheDemo.js
  useEffect(
    () =>
      postal.package("video", ({ content }) => {
        if (content) setVideoUrl(URL.createObjectURL(content));
      }),
    [postal],
  );

  useEffect(() => {
    // each script loads into the worker once, however many tabs ask
    postal.load("./workerSubscribeDemo.js");
    postal.load("./videoCacheDemo.js");
  }, [postal]);

  const store = JSON.stringify({ ...input.box, ...clicked.box, ...random.box });

  return (
    <div id="App">
      <h1>React Demo</h1>
      <p>Open this page in two tabs: the input, the counter and the store stay in sync.</p>
      <input value={input.value ?? ""} onChange={(e) => postal.post("input", e.target.value)} />
      <br />
      <br />
      <Button variant="contained" onClick={() => postal.post("clicked", (clicked.value ?? 0) + 1)}>
        Clicked {clicked.value ?? 0} Times
      </Button>
      <br />
      <br />
      <div id="demo">store: {store}</div>
      {videoUrl && (
        <video style={{ width: "400px", height: "400px" }} src={videoUrl} autoPlay controls loop muted />
      )}
    </div>
  );
}

export default App;
