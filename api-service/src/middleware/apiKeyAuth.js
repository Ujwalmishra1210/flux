module.exports = (req, res, next) => {
    const apiKey = req.header("x-api-key");
  
    if (!apiKey) {
      return res.status(401).json({
        error: "API key is required"
      });
    }
  
    if (apiKey !== process.env.API_KEY) {
      return res.status(401).json({
        error: "Invalid API key"
      });
    }
  
    next();
  };