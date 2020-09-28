module.exports = {
  extends: "airbnb-base",
  env: {
    mocha: true,
    node: true,
  },

  overrides: [
    {
      files: ["*.test.js", "*.spec*"],
      rules: {
        "no-unused-expressions": "off",
      },
    },
    {
      files: ["*"],
      rules: {
        "max-len": ["error", { code: 180 }],
      },
    },
  ],
};
