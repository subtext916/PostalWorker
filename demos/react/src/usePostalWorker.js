import React, { useEffect, useState } from "react";
import PostalWorker from "./PostalWorker.es";

export default () => {
  const postal = PostalWorker({
    PostalRoute: "./"
  });
  return postal;
};
