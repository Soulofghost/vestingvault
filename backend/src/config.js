export const config = {
  port: process.env.PORT || 4024,
  env: process.env.NODE_ENV || 'development',
  tokenSymbol: process.env.TOKEN_SYMBOL || 'VAULT',
  tokenDecimals: 18,
  contractAddress: process.env.CONTRACT_ADDRESS || '0x95aD61b0a150d79219dCF64E1E6Cc01f0B64C4cE'
};
