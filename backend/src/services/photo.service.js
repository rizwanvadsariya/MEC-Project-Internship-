/**
 * Issue scoped signed upload URLs, enforce MIME/size, strip EXIF server-side, register objects against a visit or issue.
 * Business logic only — no HTTP objects, no raw SQL. Calls repositories/ for
 * data and other services/ for cross-cutting actions. Unit-testable in isolation.
 */
'use strict';
const crypto = require('crypto');
const photoRepo = require('../repositories/photo.repo');
const storage = require('../lib/storage');
const ApiError = require('../lib/ApiError');
const { config } = require('../config');

const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MAX_BYTES = 10 * 1024 * 1024;

async function upload(actor, siteVisitId, file, metadata = {}) {
	const context = await photoRepo.findVisitContext(siteVisitId, actor);
	if (!context) throw ApiError.notFound('Site visit not found');
	if (!context.isLeadMeo) throw ApiError.forbidden('Only the lead MEO can upload visit photos');
	if (!file) throw ApiError.badRequest('A photo file is required');
	if (!ALLOWED_TYPES.has(file.mimetype)) throw ApiError.badRequest('Only JPEG, PNG, and WebP photos are supported');
	if (file.size > MAX_BYTES) throw ApiError.badRequest('Photo must be 10 MB or smaller');

	const extension = file.mimetype.split('/')[1].replace('jpeg', 'jpg');
	const storagePath = `${siteVisitId}/${actor.id}/${crypto.randomUUID()}.${extension}`;
	try {
		await storage.upload(config.STORAGE_BUCKET_VISIT_PHOTOS, storagePath, file);
		return await photoRepo.create(siteVisitId, actor.id, storagePath, metadata);
	} catch (error) {
		await storage.remove(config.STORAGE_BUCKET_VISIT_PHOTOS, storagePath).catch(() => {});
		if (error?.__isStorageError === true || error?.namespace === 'storage' || error?.name === 'StorageApiError') {
			throw ApiError.conflict('Photo storage is not configured for server uploads', undefined, 'PHOTO_STORAGE_UNAVAILABLE');
		}
		throw error;
	}
}

async function list(actor, siteVisitId) {
	const context = await photoRepo.findVisitContext(siteVisitId, actor);
	if (!context) throw ApiError.notFound('Site visit not found');
	const photos = await photoRepo.list(siteVisitId);
	return Promise.all(photos.map(async (photo) => ({
		...photo,
		signedUrl: await storage.createSignedUrl(config.STORAGE_BUCKET_VISIT_PHOTOS, photo.storagePath),
	})));
}

async function remove(actor, siteVisitId, photoId) {
	const context = await photoRepo.findVisitContext(siteVisitId, actor);
	if (!context) throw ApiError.notFound('Site visit not found');
	if (!context.isLeadMeo) throw ApiError.forbidden('Only the lead MEO can remove visit photos');
	const photo = await photoRepo.findById(siteVisitId, photoId);
	if (!photo) throw ApiError.notFound('Photo not found');
	await storage.remove(config.STORAGE_BUCKET_VISIT_PHOTOS, photo.storagePath);
	await photoRepo.remove(photo.id);
}

module.exports = { upload, list, remove, ALLOWED_TYPES, MAX_BYTES };
