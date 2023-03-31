/**
 * This is a demonstration of a worker program
 * This code is not executed in the main thread and it is shared by ALL windows on the same domain
 * use on and fire to communicate back and forth with the community
 */
// self.init is REQUIRED to have access to the postal worker library
self.init = function (PostalWorker) {
  let randomNumber = 0;

  PostalWorker().postBox("randomNumber", post => {
    randomNumber = post;
  });

  // Register for server sent events...
  // currently only available in worker
  PostalWorker().subscribe(
    "http://127.0.0.1:8081/eventSource",
    msg => {
      PostalWorker().post("randomNumber", JSON.parse(msg.data).blah);
    },
    (/*error*/) => {
      PostalWorker().fire("demoNotification", "XXXX");
    }
  );
};
