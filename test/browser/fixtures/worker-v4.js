// v4-style worker script: the API is passed as a factory
self.init = function (PostalWorker) {
  PostalWorker().on("v4ping", () => PostalWorker().fire("v4pong", "hi from a v4 script"));
};
