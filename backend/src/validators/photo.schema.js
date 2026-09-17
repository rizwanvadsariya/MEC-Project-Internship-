'use strict';

const { z } = require('zod');

module.exports = {
	idParam: { params: z.object({ id: z.string().uuid() }) },
	photoParam: { params: z.object({ id: z.string().uuid(), photoId: z.string().uuid() }) },
};