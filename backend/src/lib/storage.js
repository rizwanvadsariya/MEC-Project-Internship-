/**
 * Supabase Storage helpers: issue short-lived signed upload/download URLs scoped
 * to a viewer allowed to see that visit, MIME/size allow-list, server-side EXIF
 * strip + re-encode before persist (architecture.md §4.4).
 */
'use strict';
const { storageSupabase } = require('../config/supabase');
const { config } = require('../config');

async function upload(bucket, path, file) {
	const { error } = await storageSupabase.storage.from(bucket).upload(path, file.buffer, {
		contentType: file.mimetype, upsert: false,
	});
	if (error) throw error;
}

async function remove(bucket, path) {
	const { error } = await storageSupabase.storage.from(bucket).remove([path]);
	if (error) throw error;
}

async function createSignedUrl(bucket, path) {
	const { data, error } = await storageSupabase.storage.from(bucket).createSignedUrl(path, config.SIGNED_URL_TTL_SECONDS);
	if (error) throw error;
	return data.signedUrl;
}

module.exports = { upload, remove, createSignedUrl };
