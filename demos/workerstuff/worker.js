/**
 * This is a demonstration of a worker program
 * This code is not executed in the main thread and it is shared by ALL windows on the same domain
 * use on and fire to communicate back and forth with the community
 */

const demo = {
  count: 0,
  message: ""
};

// Important - self.init must be defined
self.init = function (PostalWorker) {
  // self.postal = PostalWorker();
  // Subscribe to worker-side postal events
  PostalWorker().on("demoSubscribe", () => {
    if (demo.message) PostalWorker().fire("demoAttribute", demo.message);
  });
  PostalWorker().on("demoUpdate", () => {
    demo.count = demo.count + 1;
    demo.message = `Clicked ${demo.count} Times`;
    PostalWorker().fire("demoAttribute", demo.message);
  });

  PostalWorker().on("mouseover", () => {
    PostalWorker().fire("hover", true);
  });
  PostalWorker().on("mouseout", () => {
    PostalWorker().fire("hover", false);
  });

  // Register for server sent events...
  // currently only available in worker
  PostalWorker().subscribe(
    "http://127.0.0.1:8081/eventSource",
    msg => {
      PostalWorker().fire("demoNotification", JSON.parse(msg.data).blah);
    },
    (/*error*/) => {
      PostalWorker().fire("demoNotification", "XXXX");
    }
  );

  // PostalWorker().package("remotePackage", () => {});
  PostalWorker().pack("remotePackage", "../../remote.png");
};
