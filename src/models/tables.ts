import mongoose, { Document, Model, Schema } from "mongoose";

export enum Suit {
  HEARTS,
  CLUBS,
  SPADES,
  DIAMONDS,
}

export interface Card {
  suit: string,
  rank: "A" | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | 'J' | 'Q' | 'K',
}

export enum GameType {
  NLH,
}

export enum SideGame {
  BOMBPOT,
}

export enum ActionTypeEnum {
  BET,
  CHECK,
  FOLD,
}

export enum PlayerStatus {
  AWAY,
  ACTIVE,
}

export interface IIngressRequest extends Document {
  tid: string,
  pid: string,
  displayName: string,
  stack: number,
  seat: number,
  createdAt: Date,
}

export interface ITableConfig extends Document {
  maxPlayers: number,
  game: string,
  sideGames: string[],
  blinds: [number, number],
  ante: number,
}

export interface ITablePlayer extends Document {
  stack: number,
  bet: number,
  status: "ACTIVE" | "AWAY",
  displayName: string,
  isYou?: boolean,
  isShowing: boolean,
  _id: string,
  inHand: boolean,
  allIn: boolean,
  agreeToRunItTwice: boolean,
  folded: boolean,
  winner: boolean,
  username: string,
  holeCards: Card[],
  autoActionCount: number,
}

export interface IPot extends Document {
  size: number,
  players: string[],
}

export interface IAction extends Document {
  bet: number,
  type: string,
  auto: boolean,
  player: ITablePlayer,
}

export interface ILedgerData extends Document {
  buyIn: number,
  displayName: string,
  dipped: boolean,
  dippedWithStack: number,
}

export interface ITable extends Document {
  name: string,
  config: ITableConfig,
  owner: string,
  active: boolean,
  turn: number, // seat index
  dealer: number,
  currentBet: number,
  minBet: number,
  turnStarted: Date,
  players: Map<string, ITablePlayer>,
  pots: IPot[],
  deck: Card[],
  communityCards: Card[][],
  actions: IAction[],
  ledger: Map<string, ILedgerData>,
  decidingRunItTwice: boolean,
  createdAt: Date,
}

const CardSchema: Schema<Card> = new mongoose.Schema(
  {
    suit: {
      type: String,
      enum: Suit,
      required: true,
    },
    rank: {
      type: String,
      required: true,
    }
  }
);

const LedgerDataSchema: Schema<ILedgerData> = new mongoose.Schema(
  {
    buyIn: {
      type: Number,
      required: true,
    },
    dipped: {
      type: Boolean,
      required: true,
    },
    dippedWithStack: {
      type: Number,
      required: true,
    },
    displayName: {
      type: String,
      required: true,
    }
  },
);

const TableConfigSchema: Schema<ITableConfig> = new mongoose.Schema(
  {
    maxPlayers: {
      type: Number,
      required: true,
    },
    game: {
      type: String,
      enum: GameType,
      required: true,
    },
    sideGames: {
      type: [{ type: String, enum: SideGame }],
      required: true,
    },
    blinds: {
      type: [Number, Number],
      required: true,
    },
    ante: {
      type: Number,
      required: true,
    }
  },
);

const TablePlayerSchema: Schema<ITablePlayer> = new mongoose.Schema(
  {
    stack: {
      type: Number,
      required: true,
    },
    status: {
      type: String,
      enum: PlayerStatus,
      required: true,
    },
    displayName: {
      type: String,
      required: true,
    },
    agreeToRunItTwice: {
      type: Boolean,
      required: true,
    },
    _id: {
      type: String,
      required: true,
    },
    holeCards: {
      type: [{ type: CardSchema }],
      required: true,
    },
    bet: {
      type: Number,
      required: true,
    },
    inHand: {
      type: Boolean,
      required: true,
    },
    folded: {
      type: Boolean,
      required: true,
    },
    winner: {
      type: Boolean,
      required: true,
    },
    allIn: {
      type: Boolean,
      required: true,
    },
    isShowing: {
      type: Boolean,
      required: true,
    },
    autoActionCount: {
      type: Number,
      required: true,
    }
  }
);

const PotSchema: Schema<IPot> = new mongoose.Schema(
  {
    size: {
      type: Number,
      required: true,
    },
    players: {
      type: [{ type: String }],
      required: true,
    }
  },
);

const ActionSchema: Schema<IAction> = new mongoose.Schema(
  {
    bet: {
      type: Number,
      required: true,
    },
    type: {
      type: String,
      enum: ActionTypeEnum,
      required: true,
    },
    auto: {
      type: Boolean,
      required: true,
    },
    player: {
      type: TablePlayerSchema,
      required: true,
    },
  },
);

const IngressRequestSchema: Schema<IIngressRequest> = new mongoose.Schema(
  {
    pid: {
      type: String,
      required: true,
    },
    tid: {
      type: String,
      required: true,
    },
    stack: {
      type: Number,
      required: true,
    },
    seat: {
      type: Number,
      required: true,
    },
    displayName: {
      type: String,
      required: true,
    }
  },
  {
    timestamps: {
      createdAt: "createdAt",
    },
  }
);

const TableSchema: Schema<ITable> = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
    },
    config: {
      type: TableConfigSchema,
      required: true,
    },
    ledger: {
      type: Map,
      of: LedgerDataSchema,
      required: true,
    },
    owner: {
      type: String,
      required: true,
    },
    active: {
      type: Boolean,
      required: true,
    },
    decidingRunItTwice: {
      type: Boolean,
      required: true,
    },
    turn: {
      type: Number, // seat index
      required: true,
    },
    currentBet: {
      type: Number, // seat index
      required: true,
    },
    minBet: {
      type: Number,
      required: true,
    },
    turnStarted: {
      type: Date,
      required: true,
    },
    dealer: {
      type: Number,
      required: true,
    },
    players: {
      type: Map,
      of: TablePlayerSchema,
      required: true,
    },
    pots: {
      type: [{ type: PotSchema }],
      required: true,
    },
    deck: {
      type: [{ type: CardSchema }],
      required: true,
    },
    communityCards: {
      type: [{ type: [{ type: CardSchema }] }],
      required: true,
    },
    actions: {
      type: [{ type: ActionSchema }],
      required: true,
    },
  },
  {
    timestamps: {
      createdAt: "createdAt",
    },
  }
);

export interface IChatMessage extends Document {
  author: ITablePlayer,
  message: string,
  createdAt: Date,
  tableId: string,
  server: boolean,
}

const ChatMessageSchema: Schema<IChatMessage> = new mongoose.Schema(
  {
    author: {
      type: TablePlayerSchema,
      required: true,
    },
    server: {
      type: Boolean,
      required: true,
    },
    message: {
      type: String,
      required: true,
    },
    tableId: {
      type: String,
      required: true,
    }
  },
  {
    timestamps: {
      createdAt: "createdAt",
    },
  }
);

export const TableModel: Model<ITable> = mongoose.model<ITable>(
  "Table",
  TableSchema
);

export const PotModel: Model<IPot> = mongoose.model<IPot>(
  "Pot",
  PotSchema
);

export const ChatMessageModel: Model<IChatMessage> = mongoose.model<IChatMessage>(
  "Message",
  ChatMessageSchema,
);

export const IngressRequestModel: Model<IIngressRequest> = mongoose.model<IIngressRequest>(
  "IngressReqeust",
  IngressRequestSchema,
);
