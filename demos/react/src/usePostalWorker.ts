/**
 * Hook to implement instance of PostalWorker script
 */
import PostalWorker from "./PostalWorker.es";

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
