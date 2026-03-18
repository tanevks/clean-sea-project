import express from 'express';
import cors from 'cors';
import path from 'path';
import rateLimit from 'express-rate-limit';
import markersRouter from './routes/markers';
import messagesRouter from './routes/messages';
import uploadsRouter from './routes/uploads';
import groupsRouter from './routes/groups';
import resultsRouter from './routes/results';

const app = express();
const PORT = process.env.PORT || 3001;

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
});

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

app.use('/api/markers', apiLimiter, markersRouter);
app.use('/api/messages', apiLimiter, messagesRouter);
app.use('/api/uploads', apiLimiter, uploadsRouter);
app.use('/api/groups', apiLimiter, groupsRouter);
app.use('/api/results', apiLimiter, resultsRouter);

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});

export default app;
