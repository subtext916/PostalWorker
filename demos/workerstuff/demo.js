{
  (() => {
    let postal = window.PostalWorker();
    postal.load("/demos/workerstuff/worker.js");
  })();
}
