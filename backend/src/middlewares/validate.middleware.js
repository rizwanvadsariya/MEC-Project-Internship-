const ApiError = require("../utils/ApiError");

// Runs a validator function (from src/validators). The validator receives the
// request and returns { value } or throws / returns { error: "msg" }.
function validate(validator) {
	return function run(req, res, next) {
		try {
			const result = validator(req);
			if (result && result.error) return next(new ApiError(422, result.error, result.details));
			if (result && result.value) req.validated = result.value;
			return next();
		} catch (err) {
			return next(err instanceof ApiError ? err : new ApiError(422, err.message));
		}
	};
}

module.exports = { validate };
