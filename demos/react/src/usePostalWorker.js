import PostalWorker from "./PostalWorker.es";

const usePostalWorker = () => {
  const postal = PostalWorker({
    PostalRoute: "./"
  });
  return postal;
};

export default usePostalWorker;
