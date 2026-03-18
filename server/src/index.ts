import express from 'express';
import cors from 'cors';
import path from 'path';
import markersRouter from './routes/markers';
import messagesRouter from './routes/messages';
import uploadsRouter from './routes/uploads';
import groupsRouter from './routes/groups';
import resultsRouter from './routes/results';

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

app.use('/api/markers', markersRouter);
app.use('/api/messages', messagesRouter);
app.use('/api/uploads', uploadsRouter);
app.use('/api/groups', groupsRouter);
app.use('/api/results', resultsRouter);

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});

export default app;
