export const USDC_ADDRESS = "0x3600000000000000000000000000000000000000" as const;

// Set after deployment — update NEXT_PUBLIC_PAYROLL_ADDRESS in .env.local
export const PAYROLL_ADDRESS = (
  process.env.NEXT_PUBLIC_PAYROLL_ADDRESS ?? ""
) as `0x${string}`;

export const PAYROLL_ABI = [
  {
    type: "constructor",
    inputs: [{ name: "_usdc", type: "address", internalType: "address" }],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "createStream",
    inputs: [
      { name: "employee", type: "address", internalType: "address" },
      { name: "ratePerSecond", type: "uint128", internalType: "uint128" },
      { name: "deposit", type: "uint128", internalType: "uint128" },
      { name: "invoiceRef", type: "string", internalType: "string" },
    ],
    outputs: [{ name: "streamId", type: "uint256", internalType: "uint256" }],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "withdraw",
    inputs: [{ name: "streamId", type: "uint256", internalType: "uint256" }],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "topUp",
    inputs: [
      { name: "streamId", type: "uint256", internalType: "uint256" },
      { name: "amount", type: "uint128", internalType: "uint128" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "cancelStream",
    inputs: [{ name: "streamId", type: "uint256", internalType: "uint256" }],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "accrued",
    inputs: [{ name: "streamId", type: "uint256", internalType: "uint256" }],
    outputs: [{ name: "", type: "uint128", internalType: "uint128" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "runway",
    inputs: [{ name: "streamId", type: "uint256", internalType: "uint256" }],
    outputs: [{ name: "", type: "uint256", internalType: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "streams",
    inputs: [{ name: "", type: "uint256", internalType: "uint256" }],
    outputs: [
      { name: "employer", type: "address", internalType: "address" },
      { name: "employee", type: "address", internalType: "address" },
      { name: "ratePerSecond", type: "uint128", internalType: "uint128" },
      { name: "startTime", type: "uint64", internalType: "uint64" },
      { name: "lastClaimTime", type: "uint64", internalType: "uint64" },
      { name: "deposit", type: "uint128", internalType: "uint128" },
      { name: "active", type: "bool", internalType: "bool" },
      { name: "invoiceRef", type: "string", internalType: "string" },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getEmployerStreams",
    inputs: [{ name: "employer", type: "address", internalType: "address" }],
    outputs: [{ name: "", type: "uint256[]", internalType: "uint256[]" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getEmployeeStreams",
    inputs: [{ name: "employee", type: "address", internalType: "address" }],
    outputs: [{ name: "", type: "uint256[]", internalType: "uint256[]" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "nextStreamId",
    inputs: [],
    outputs: [{ name: "", type: "uint256", internalType: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "event",
    name: "StreamCreated",
    inputs: [
      { name: "streamId", type: "uint256", indexed: true },
      { name: "employer", type: "address", indexed: true },
      { name: "employee", type: "address", indexed: true },
      { name: "ratePerSecond", type: "uint128", indexed: false },
      { name: "deposit", type: "uint128", indexed: false },
      { name: "invoiceRef", type: "string", indexed: false },
    ],
  },
  {
    type: "event",
    name: "Withdrawn",
    inputs: [
      { name: "streamId", type: "uint256", indexed: true },
      { name: "employee", type: "address", indexed: true },
      { name: "amount", type: "uint128", indexed: false },
    ],
  },
  {
    type: "event",
    name: "StreamToppedUp",
    inputs: [
      { name: "streamId", type: "uint256", indexed: true },
      { name: "employer", type: "address", indexed: true },
      { name: "amount", type: "uint128", indexed: false },
    ],
  },
  {
    type: "event",
    name: "StreamCancelled",
    inputs: [
      { name: "streamId", type: "uint256", indexed: true },
      { name: "employer", type: "address", indexed: true },
      { name: "refunded", type: "uint128", indexed: false },
    ],
  },
] as const;

export const ERC20_ABI = [
  {
    type: "function",
    name: "approve",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "allowance",
    inputs: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
    ],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "balanceOf",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
] as const;
