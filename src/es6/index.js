/**
 * PostalWorker Main Source
 * (Legacy Version - Adds global PostalWorker method to window global scope)
 * @Author: Russ Stratfull - 2018 - 2023
 */

import { PostalWorker } from "./PostalWorker";
import safeJsonStringify from "safe-json-stringify";

let _PostalWorker;
(function () {
  _PostalWorker = new PostalWorker({}, safeJsonStringify);
})();
window.PostalWorker = () => _PostalWorker;
