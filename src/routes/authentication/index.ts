import HyperExpress from "hyper-express";
import signupController from "../../controllers/authentication/signup.controller.js";
import loginController from "../../controllers/authentication/login.controller.js";
import guestController from "../../controllers/authentication/guest.controller.js";

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

/**
 * POST /auth/login
 * Route to handle user login requests.
 * When a POST request is made to /auth/login, it invokes the loginController function.
 */
router.post("/login", corsMiddleware, loginController);

router.post("/guest", corsMiddleware, guestController);

/**
 * POST /auth/signup
 * Route to handle user signup requests.
 * When a POST request is made to /auth/signup, it invokes the signupController function.
 */
router.post("/signup", corsMiddleware, signupController);

// add more routes like forget password, reset password here

// Export the router for use in other parts of the application.
export default router;
