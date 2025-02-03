import HyperExpress from "hyper-express";
import createTableController from "../../controllers/table/create.controller.js";
import getIngressRequestsController from "../../controllers/table/ingress.controller.js";
import { ensureOwner, handleRunItTwice, handleDeny, handleCheck, handleBet, handleAway, handleSit, handleFold, handlePause, handleShow, handleStart, handleLeave, handleRebuy, handleSendChat, handleSetConfig, handleApprove, handleCall, handleUnshow, handleBack} from '../../controllers/table/game.controller.js';
import { authenticate, wsAuthenticate } from "../../middlewares/auth.middleware.js";

const corsMiddleware = (_: HyperExpress.Request, response: HyperExpress.Response, next: HyperExpress.MiddlewareNext) => {
  response.setHeader('Access-Control-Allow-Origin', '*')
  response.setHeader('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization')
  response.setHeader("Content-Type", "application/json");
  response.setHeader('Access-Control-Allow-Methods', 'OPTIONS, POST, GET, PUT, DELETE')
  response.setHeader('Access-Control-Allow-Credentials', "true")
  next();
}

// Create an instance of an Express router.
const router = new HyperExpress.Router();

router.post("/create", corsMiddleware, authenticate, createTableController);
router.get("/:tid/ingress", corsMiddleware, authenticate, getIngressRequestsController);

export enum WebsocketMessageType {
  UPDATE_REMOTE_STATE,
  NEW_CHAT,
  CHECK,
  CALL,
  FOLD,
  BET,
  AWAY,
  BACK,
  LEAVE,
  REBUY,
  SHOW,
  SIT,
  SEND_CHAT,
  APPROVE,
  DENY,
  SET_CONFIG,
  PAUSE,
  START,
  UNSHOW,
  RUN_IT_TWICE,
}

export interface WebsocketMessage {
  type: string,
  data: any,
}

const isWebsocketMessage = (obj: any) => {
  return typeof obj.type === "string" && typeof obj.data !== null && typeof obj.data !== undefined && Object.values(WebsocketMessageType).includes(obj.type);
}

export const handleWebsocketMessage = async(socket: HyperExpress.Websocket, app: HyperExpress.Server, msg: string, _: boolean) => {
  const data = JSON.parse(msg);
  if (isWebsocketMessage(data)) {
    const body: WebsocketMessage = data as WebsocketMessage;
    switch (body.type) {
      case "CHECK":
        console.log('chk');
        await handleCheck(socket, app, body.data);
        break;
      case "FOLD":
        console.log('fold');
        await handleFold(socket, app, body.data);
        break;
      case "CALL":
        console.log('ring ring ring');
        await handleCall(socket, app, body.data);
        break;
      case "BET":
        console.log('bet');
        await handleBet(socket, app, body.data);
        break;
      case "AWAY":
        console.log('away?');
        await handleAway(socket, app, body.data);
        break;
      case "BACK":
        await handleBack(socket, app, body.data);
        break;
      case "LEAVE":
        await handleLeave(socket, app, body.data);
        break;
      case "REBUY":
        await handleRebuy(socket, app, body.data);
        break;
      case "SHOW":
        await handleShow(socket, app, body.data);
        break;
      case "RUN_IT_TWICE":
        await handleRunItTwice(socket, app, body.data);
        break;
      case "UNSHOW":
        console.log('unshow?');
        await handleUnshow(socket, app, body.data);
        break;
      case "SIT":
        await handleSit(socket, app, body.data);
        break;
      case "SEND_CHAT":
        await handleSendChat(socket, app, body.data);
        break;
      case "APPROVE":
        if (!await ensureOwner(socket.context.userId, socket.context.tableId)) {
          console.log('Not the owner');
          return;
        }
        await handleApprove(socket, app, body.data);
        break;
      case "DENY":
        if (!await ensureOwner(socket.context.userId, socket.context.tableId)) {
          console.log('Not the owner');
          return;
        }
        await handleDeny(socket, app, body.data);
        break;
      case "SET_CONFIG":
        if (!await ensureOwner(socket.context.userId, socket.context.tableId)) {
          console.log('Not the owner');
          return;
        }
        await handleSetConfig(socket, app, body.data);
        break;
      case "PAUSE":
        if (!await ensureOwner(socket.context.userId, socket.context.tableId)) {
          console.log('Not the owner');
          return;
        }
        await handlePause(socket, app, body.data);
        break;
      case "START":
        if (!await ensureOwner(socket.context.userId, socket.context.tableId)) {
          console.log('Not the owner');
          return;
        }
        await handleStart(socket, app, body.data);
        break;
      default:
        console.warn(body);
        break;
    }
  } else {
    console.warn(data);
  }
};

export default router;
