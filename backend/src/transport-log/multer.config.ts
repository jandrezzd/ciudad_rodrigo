import { diskStorage } from 'multer';
import { extname, join } from 'path';
import { BadRequestException } from '@nestjs/common';
import * as fs from 'fs';

const ALLOWED_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/jpg',
];

const MAX_FILE_SIZE = 5 * 1024 * 1024;

const uploadDir = join(__dirname, '..', '..', 'uploads', 'transport');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

export const multerConfig = {
  storage: diskStorage({
    destination: uploadDir,
    filename: (req, file, callback) => {
      const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
      const ext = extname(file.originalname);
      const name = `transport-${uniqueSuffix}${ext}`;
      callback(null, name);
    },
  }),
  fileFilter: (req, file, callback) => {
    if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
      return callback(
        new BadRequestException(
          `Tipo de archivo no permitido: ${file.mimetype}. Solo se permiten: JPEG, PNG, WebP`,
        ),
        false,
      );
    }

    const allowedFields = ['driver', 'vehicle', 'plate', 'material'];
    if (!allowedFields.includes(file.fieldname)) {
      return callback(
        new BadRequestException(
          `Campo no permitido: ${file.fieldname}. Solo se permiten: driver, vehicle, plate, material`,
        ),
        false,
      );
    }

    callback(null, true);
  },
  limits: {
    fileSize: MAX_FILE_SIZE,
  },
};
