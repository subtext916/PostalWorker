import React, { useEffect, useState } from "react";
import usePostalWorker from "./usePostalWorker";

function App() {
  const postal = usePostalWorker();

  const [test, setTest] = useState(null);

  useEffect(() => {
    postal.postBox("test", update => setTest(update.value));
    postal.post("test", "this is a test");
  }, [setTest]);

  return (
    <div id="App">
      <div id="demo">{test}</div>
    </div>
  );
}

export default App;
