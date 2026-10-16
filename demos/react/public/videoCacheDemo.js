// Worker script: fetch the video once in the worker and share it with every tab as a Blob.
self.init = (pw) => {
  fetch("./recording.webm")
    .then((r) => r.blob())
    .then((blob) => pw.pack("video", blob))
    .catch((error) => console.error("videoCacheDemo:", error));
};
