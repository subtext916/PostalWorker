/**
 * Hook to implement instance of PostalWorker script
 */
import PostalWorker from "./PostalWorker.es";
export type PostBoxItem = {
  value: any;
  box: any;
};
export type PostalWorkerType = {
  closeBox: (address: string) => PostalWorker;
  crossFire?: (msgClass: string, data: any) => PostalWorker;
  crossOn?: (
    msgClass: string,
    action: (msg: any) => void,
    subscriber: string,
    name: string,
    windowparams: {
      popup?: boolean;
      width?: number;
      height?: number;
      left?: number;
      top?: number;
      noopener?: boolean;
      noreferrer?: boolean;
      // todo: more?
    }
  ) => PostalWorker;
  fire?: (msgClass: string, msg: string /*, audience*/) => PostalWorker;
  fireAll?: (msgClass: string, msg: string) => PostalWorker;
  id: string;
  load?: (file: string) => PostalWorker;
  on: (msgClass: string, action: (msg: any) => any) => PostalWorker;
  pack: (address: string, content: string) => PostalWorker;
  package: (
    address: string,
    handling: (msg: { address: string; content: any }) => any
  ) => PostalWorker;
  post?: (address: string, content: any) => PostalWorker;
  postBox?: (
    address: string,
    callback: (item: PostBoxItem) => void
  ) => PostalWorker;
  sharedWorkerSupported: boolean;
  un: (msgClass: string) => PostalWorker;
  unCross: (msgClass: string, subscriber: string) => PostalWorker;
  uniqueNumber: number;
  workerOnline: boolean;
};
type PostalConfig = {
  PostalRoute: string;
};

const usePostalWorker = (config: PostalConfig) => {
  const postal = PostalWorker({
    PostalRoute: config?.PostalRoute || "./"
  });
  return postal;
};

export default usePostalWorker;
