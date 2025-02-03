import { Request, Response } from "hyper-express";
import { TableModel } from "../../models/tables.js";

export const round = function(num: number, places=2) {
  const factor = 10 ** places;
  return Math.round(num * factor) / factor;
};

const createTableController = async (req: Request, res: Response) => {
  try {
    // Extract user registration data from the request body
    const { name, maxPlayers, game, sideGames, blinds, ante } = await req.json();

    console.table(req.body);

    // Check if required fields are provided; return 400 Bad Request if any are missing
    if ([maxPlayers, game, sideGames, blinds, ante].includes(undefined)) {
      return res.status(400).json({
        message: "Missing required options",
        success: false,
      });
    }

    if (maxPlayers !== 6 && maxPlayers !== 9) {
      return res.status(400).json({
        message: "6 or 9 max",
        success: false,
      });
    }

    if (game !== "NLH") {
      return res.status(400).json({
        message: "Only NLH supported for now",
        success: false,
      });
    }

    if (sideGames.length > 0) {
      return res.status(400).json({
        message: "Sidegames not supported yet",
        success: false,
      });
    }

    if (blinds.length !== 2 || typeof blinds[0] !== "number" || typeof blinds[1] !== "number" || blinds[0] < 1 || blinds[1] < 1 || blinds[1] < blinds[0] || !Number.isSafeInteger(blinds[0]) || !Number.isSafeInteger(blinds[1])) {
      return res.status(400).json({
        message: "Invalid blind level",
        success: false,
      });
    }

    if (typeof ante !== 'number' || ante < 0 || !Number.isSafeInteger(ante)) {
      return res.status(400).json({
        message: "Invalid ante amount",
        success: false,
      });
    }

    // Create a new user account in the database
    let table = await TableModel.create({
      name,
      config: {
        maxPlayers,
        game,
        sideGames,
        blinds,
        ante,
      },
      owner: (req as any).user.uid,
      active: false,
      turn: 3, // seat index
      dealer: 0,
      currentBet: 0,
      minBet: 0,
      turnStarted: new Date(),
      players: {},
      ledger: {},
      pots: [],
      deck: [],
      decidingRunItTwice: false,
      communityCards: [],
      actions: [],
    });

    // Return a 200 OK response with a success message
    return res.status(200).json({
      message: "Table created successfully",
      success: true,
      data: { id: table._id }
    });
  } catch (error) {
    // Handle errors and return a 400 Bad Request response with the error message
    console.error('caught error', error);
    return res.status(400).json({ message: String(error), success: false });
  }
};

export default createTableController;
