import React, { useEffect, useState } from "react";
import usePostalWorker from "./usePostalWorker";

function App() {
  const postal = usePostalWorker();

  const [test, setTest] = useState(null);
  const [serializedStore, setSerializedStore] = useState("{}");
  const [randomNumber, setRandomNumber] = useState(0);

  useEffect(() => {
    console.info(postal);
    postal.postBox("test", update => {
      setTest(update.value);
      setSerializedStore(JSON.stringify(update.box));
    });
    postal.post("test", "this is a test");
  }, [setTest, setSerializedStore, postal]);

  useEffect(() => {
    postal.load("./workerSubscribeDemo.js");
    postal.on("demoNotification", msg => {
      setRandomNumber(msg);
    });
  }, [setRandomNumber, postal]);

  return (
    <div id="App">
      <h1>React Demo</h1>
      <div id="demo">
        {test} <br />
        store: {serializedStore}
      </div>
      <div id="randomNumber">Random number: {randomNumber}</div>
    </div>
  );
}

export default App;
