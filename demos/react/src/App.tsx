import React, { useEffect, useState, useCallback } from "react";
import usePostalWorker, { PostalWorkerType } from "./usePostalWorker";
import Button from "@mui/material/Button";

function App() {
  // Get instance of postalWorker using hook
  const postal: PostalWorkerType = usePostalWorker({
    PostalRoute: "./"
  });

  // Set some component states
  const [inputState, setInputState] = useState("");
  const [clicked, setClicked] = useState(0);
  const [serializedStore, setSerializedStore] = useState("{}");
  const [video, setVideo] = useState(null);

  // When the component is initialized the first time
  useEffect(() => {
    console.info(postal);
    // Register postbox for input
    postal.postBox("input", update => {
      setInputState(update.value || undefined);
      setSerializedStore(JSON.stringify(update.box));
    });
    // Register postbox for button clicks
    postal.postBox("clicked", click => {
      setClicked(click.value === null ? 0 : click.value);
      setSerializedStore(JSON.stringify(click.box));
    });
    // Register postbox for random number
    // (this gets updated in the worker thread)
    // See ../public/workerSubscribeDemo.js to see how that works
    postal.postBox("randomNumber", msg => {
      if (msg.value !== null) setSerializedStore(JSON.stringify(msg.box));
    });
    // Register postbox for video which is loaded in worker thread
    // see ../public/videoCacheDemo.js
    postal.package("video", msg => {
      if (msg.content) setVideo(msg.content);
    });
  }, [setInputState, setClicked, setVideo, setSerializedStore, postal]);

  useEffect(() => {
    // load the worker demo script into the postal worker the firt time the postal worker loads
    postal.load("./workerSubscribeDemo.js");
    // load video cache demo into worker
    postal.load("./videoCacheDemo.js");
  }, [postal]);

  const keyDown = useCallback(
    e => {
      postal.post("input", e.target.value);
    },
    [postal]
  );

  const clickButton = useCallback(() => {
    const update = clicked + 1;
    postal.post("clicked", update);
  }, [postal, clicked]);

  return (
    <div id="App">
      <h1>React Demo</h1>
      <input value={inputState || undefined} onChange={keyDown} />
      <br />
      <br />
      <br />
      <Button variant="contained" onClick={clickButton}>
        Clicked {clicked} Times
      </Button>
      <br />
      <br />
      <br />
      <div id="demo">store: {serializedStore}</div>
      {video && (
        <video
          style={{
            width: "400px",
            height: "400px"
          }}
          src={video}
          autoPlay={true}
          controls={true}
          loop={true}
        />
      )}
    </div>
  );
}

export default App;
