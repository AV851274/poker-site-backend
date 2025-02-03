import { Request, Response } from "hyper-express";
import { UserModel } from "../../models/users.js";
import { DEFAULT_TOKEN_EXPIRATION_LONG } from "../../utils/common.util.js";
import { randomUUID } from "crypto";
import JWTUtil from "../../utils/jwt.util.js";

/**
 * signupController - Handles user registration by validating input data, checking for existing accounts,
 * validating the password, hashing the password, generating a unique username, and creating a new user account.
 *
 * @param {Request} req - The HTTP request object containing user registration data.
 * @param {Response} res - The HTTP response object for.jsoning responses to the client.
 *
 * @returns {Response} - Returns an HTTP response with a status code, message, and success flag.
 */
const guestController = async (req: Request, res: Response) => {
  try {
    // Create a new user account in the database
    const user = await UserModel.create({
      guest: true,
      premium: false,
      email: `${randomUUID()}@guest.arpa`,
      password: randomUUID(),
      username: `guest${Math.floor(Math.random() * 900000000000000) + 100000000000000}`,
    });

    const tokenExpiresIn = DEFAULT_TOKEN_EXPIRATION_LONG;

    // Create a JSON Web Token (JWT) for the user
    const token = JWTUtil.createToken(user._id, user.guest, user.premium, tokenExpiresIn);

    // If token creation fails, return a 500 Internal Server Error response
    if (!token) {
      return res
        .status(500)
        .json({ message: "Can't create login token!", success: false });
    }

    return res.status(200).json({
      message: "Account created successfully",
      success: true,
      data: { token },
    });
  } catch (error) {
    // Handle errors and return a 400 Bad Request response with the error message
    console.error(error);
    return res.status(400).json({ message: String(error), success: false });
  }
};

export default guestController;
