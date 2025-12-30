import { CognitoUserPool, CognitoUser, AuthenticationDetails, CognitoUserAttribute } from 'amazon-cognito-identity-js';

const poolData = {
  UserPoolId: 'eu-west-1_6UxioIj4z',
  ClientId: '59dpqsm580j14ulkcha19shl64',
};

const userPool = new CognitoUserPool(poolData);

export const awsConfig = {
  Auth: {
    region: 'eu-west-1',
    userPoolId: 'eu-west-1_6UxioIj4z',
    userPoolWebClientId: '59dpqsm580j14ulkcha19shl64',
    mandatorySignIn: true,
    authenticationFlowType: 'USER_SRP_AUTH',
  },
};

export { userPool, CognitoUser, AuthenticationDetails, CognitoUserAttribute };
export default awsConfig;