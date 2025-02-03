import { Request, Response } from "hyper-express";
import { IIngressRequest, ITable, IngressRequestModel, TableModel } from "../../models/tables.js";

const getIngressRequestsController = async (req: Request, res: Response) => {
  try {
    const { tid } = req.params;

    const table: ITable | null = await TableModel.findById(tid).exec();
    if (table === null) {
      return res.status(404).json({
        message: "Table is not found",
        success: false,
      });
    }

    if (table.owner !== (req as any).user.uid) {
      return res.status(403).json({
        message: "You are not the owner",
        success: false,
      });
    }

    const requests: IIngressRequest[] | null = await IngressRequestModel.find({tid}).exec();
    if (requests == null) {
      return res.status(200).json({
        success: true,
        data: [],
      });
    }

    // Return a 200 OK response with a success message
    return res.status(200).json({
      message: "Table created successfully",
      success: true,
      data: requests,
    });
  } catch (error) {
    // Handle errors and return a 400 Bad Request response with the error message
    console.error('caught error', error);
    return res.status(400).json({ message: String(error), success: false });
  }
};

export default getIngressRequestsController;
