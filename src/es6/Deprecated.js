
import * as S from './strings';

export default class Deprecated {

    static registerWorker(worker, OK, events, address) {
        worker.port.onmessage = (event) => {
            
            // Handle messages sent from worker by type
            switch (event.data.type) {
                case S.FIRE: // If the legacy messaging is used, it will still work here
                    // Send the message
                    if (event.data.data.msgClass &&
                        events.get(event.data.data.msgClass)) {
                        events.get(event.data.data.msgClass)(event.data.data.message);
                    }
                    // Let worker know message was received
                    event.currentTarget.postMessage(OK);
                    break;
                case S.SET_ADDRESS: {
                    Deprecated.address = event.data.data;
                    break;
                }
                case S.ERROR:
                    console.error(event.data.data);
                    break;
                default: console.warn(event);
            }
        };
    }
}