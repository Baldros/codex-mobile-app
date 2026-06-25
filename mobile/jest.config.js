module.exports = {
  preset: "jest-expo",
  moduleDirectories: ["node_modules", "<rootDir>/node_modules/expo/node_modules"],
  testMatch: ["**/test/**/*.test.ts"],
  testPathIgnorePatterns: ["/node_modules/"]
};
