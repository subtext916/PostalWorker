self.init = function (PostalWorker) {
  PostalWorker().package("video", msg => {
    console.info(msg);
  });
  PostalWorker().pack("video", "./recording.webm");
};
