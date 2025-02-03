import HyperExpress from "hyper-express";
import projectRoutes from "../routes/index.js";
import { wsAuthenticate } from "../middlewares/auth.middleware.js";
import { handleWebsocketMessage } from "../routes/table/index.js";
import { TableModel } from "../models/tables.js";
import { updatePlayerState, updateState } from "../controllers/table/game.controller.js";

const corsMiddleware = (_: HyperExpress.Request, response: HyperExpress.Response, next: HyperExpress.MiddlewareNext) => {
  response.setHeader('Access-Control-Allow-Origin', '*')
  response.setHeader('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization')
  response.setHeader("Content-Type", "application/json");
  response.setHeader('Access-Control-Allow-Methods', 'OPTIONS, POST, GET, PUT, DELETE')
  response.setHeader('Access-Control-Allow-Credentials', "true")
  next();
}

/**
 * expressConfig - Sets up the configuration for an Express application.
 * @param {express.Application} app - An instance of the Express application.
 */
const expressConfig = (app: HyperExpress.Server) => {
  // Register CORS middleware to handle cross-origin requests with credentials
  /*
  app.use(cors({ credentials: true }));

  // Enable response compression middleware for reducing data size
  app.use(compression());

  // Parse JSON request bodies
  app.use(bodyParser.json());

  // Parse cookies from incoming requests
  app.use(cookieParser());

  // Enhance security with HTTP headers using Helmet middleware
  app.use(
    helmet.hsts({
      maxAge: 31536000, // One year in seconds
      includeSubDomains: true,
      preload: true,
    })
  ); // Enable HTTP Strict Transport Security (HSTS) header

  // Log HTTP requests and responses in a development-friendly format
  app.use(morgan("dev"));
  */
  app.options('/*', corsMiddleware, (_, response) => {
    return response.send('');
  });

  // Register API routes from the projectRoutes array
  for (const route of projectRoutes) {
    app.use(route.path, route.component);
  }

  app.upgrade('/ws/:tableId', {
    middlewares: [wsAuthenticate]
  }, async(request, response) => {
    const table = await TableModel.findById({_id: request.params.tableId});
    if (table) {
      let sat = false;
      for (let [_, player] of table.players) {
          if (player._id === (request as any).user.uid) {
            sat = true;
            console.log('Subscribed as a user', player.displayName);
            break;
          }
      }
      response.upgrade({
        userId: (request as any).user.uid,
        tableId: request.params.tableId,
        sat,
        initialTable: table,
      })
    } else {
      return response.status(400).json({
        message: "Unreal table",
        success: false,
      });
    }
  });

  app.ws('/ws/:tableId', {
    idle_timeout: 60,
    max_payload_length: 32 * 1024,
  }, (ws) => {
    ws.subscribe(`${ws.context.userId}`);
    ws.subscribe(`${ws.context.tableId}/chat`);
    if (ws.context.sat) {
      ws.subscribe(`${ws.context.tableId}/${ws.context.userId}`);
    } else {
      ws.subscribe(`${ws.context.tableId}/${ws.context.userId}`);
      ws.subscribe(`${ws.context.tableId}`);
    }
    updateState(ws, app);
    ws.on('close', () => console.log(ws.ip + ' has now disconnected!'));
    ws.on('message', handleWebsocketMessage.bind({}, ws, app));
    console.log(ws.context.userId, ws.context.tableId);
  });


  // Error handling middleware (used only during development)
  /*
  if (process.env.NODE_ENV === "development") {
    app.use(errorHandler());
  }
  */
};

export default expressConfig;
