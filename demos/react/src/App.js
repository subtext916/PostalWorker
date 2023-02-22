import React, { useEffect, useState } from "react";
import PostalWorker from "./PostalWorker.es";
// import "./App.css";
function App() {
  const postal = PostalWorker({
    PostalRoute: "./"
  });

  const [test, setTest] = useState(null);
  // postal.postBox("test", update => setTest(update));

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
