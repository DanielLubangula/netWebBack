const express = require('express');
const fs = require('fs');
const path = require('path');
const router = express.Router();
const User = require('../models/User');

const QUESTIONS_DIR = path.join(__dirname, '..', 'data', 'questions');

// Crée le dossier si non existant
if (!fs.existsSync(QUESTIONS_DIR)) {
  fs.mkdirSync(QUESTIONS_DIR, { recursive: true });
}

router.post('/save', (req, res) => {
  const { theme, content } = req.body;

  if (!theme || !content) {
    return res.status(400).json({ message: 'Theme et contenu requis' });
  }

  const filename = `${theme.toLowerCase().replace(/\s+/g, '-')}.md`;
  const filePath = path.join(QUESTIONS_DIR, filename);

  const formattedContent = `\n\n${content.trim()}`; // Ajoute un saut de ligne propre

  // Vérifie si le fichier existe déjà
  if (fs.existsSync(filePath)) {
    // Le fichier existe → on ajoute à la fin
    fs.appendFile(filePath, formattedContent, 'utf-8', (err) => {
      if (err) {
        console.error('Erreur lors de l’ajout :', err);
        return res.status(500).json({ message: 'Erreur serveur' });
      }

      res.json({ message: 'Question ajoutée au thème existant' });
    });
  } else {
    // Le fichier n'existe pas → on le crée
    fs.writeFile(filePath, content.trim(), 'utf-8', (err) => {
      if (err) {
        console.error('Erreur lors de la création :', err);
        return res.status(500).json({ message: 'Erreur serveur' });
      }

      res.json({ message: 'Nouveau fichier créé avec la première question' });
    });
  }
});

router.get('/themes', (req, res) => {
  try {
    // Lire les fichiers dans le dossier QUESTIONS_DIR
    const files = fs.readdirSync(QUESTIONS_DIR);

    // Extraire les noms des fichiers sans leur extension
    const themes = files.map(file => path.basename(file, path.extname(file)));

    res.status(200).json( themes );
  } catch (error) {
    console.error('Erreur lors de la lecture des fichiers :', error);
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

router.get('/theme/:name', (req, res) => {
  try {
    const themeName = req.params.name; // Récupérer le nom du thème depuis les paramètres de l'URL
    const filename = `${themeName.toLowerCase().replace(/\s+/g, '-')}.md`; // Construire le nom du fichier
    const filePath = path.join(QUESTIONS_DIR, filename); // Chemin complet du fichier

    // Vérifier si le fichier existe
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ message: 'Thème non trouvé' });
    }

    // Lire le contenu du fichier
    const content = fs.readFileSync(filePath, 'utf-8'); // Lire le fichier en UTF-8

    res.status(200).json({ theme: themeName, content }); // Retourner le contenu du fichier
  } catch (error) {
    console.error('Erreur lors de la lecture du fichier :', error);
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

router.put('/theme/:name', (req, res) => {
  try {
    const currentThemeName = req.params.name; // Nom actuel du thème
    const { newName, newContent } = req.body; // Nouveau nom et nouveau contenu

    const currentFilename = `${currentThemeName.toLowerCase().replace(/\s+/g, '-')}.md`; // Nom actuel du fichier
    const currentFilePath = path.join(QUESTIONS_DIR, currentFilename); // Chemin actuel du fichier

    // Vérifier si le fichier existe
    if (!fs.existsSync(currentFilePath)) {
      return res.status(404).json({ message: 'Thème non trouvé' });
    }

    // Si un nouveau nom est fourni, construire le nouveau chemin
    let newFilePath = currentFilePath;
    if (newName) {
      const newFilename = `${newName.toLowerCase().replace(/\s+/g, '-')}.md`;
      newFilePath = path.join(QUESTIONS_DIR, newFilename);
    }

    // Écrire les nouvelles données dans le fichier (ou déplacer si le nom change)
    if (newName && newFilePath !== currentFilePath) {
      fs.renameSync(currentFilePath, newFilePath); // Renommer le fichier
    }

    // Mettre à jour le contenu du fichier
    fs.writeFileSync(newFilePath, newContent.trim(), 'utf-8');

    res.status(200).json({ message: 'Thème modifié avec succès', newName, newContent });
  } catch (error) {
    console.error('Erreur lors de la modification du fichier :', error);
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

router.get('/theme/:theme/json/:questionCount', (req, res) => {
    const themeName = req.params.theme;
    const questionCount = parseInt(req.params.questionCount, 10);
    const filename = `${themeName.toLowerCase().replace(/\s+/g, '-')}.md`;
    const filePath = path.join(QUESTIONS_DIR, filename);

    if (!fs.existsSync(filePath)) {
        return res.status(404).json({ message: 'Thème non trouvé' });
    }

    const content = fs.readFileSync(filePath, 'utf-8');

    const shuffleArray = (array) => {
        for (let i = array.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [array[i], array[j]] = [array[j], array[i]];
        }
        return array;
    };

    try {
        const rawBlocks = content.split(/###\s*(QCM|VF|Libre)/).slice(1);

        const questions = [];
        for (let i = 0; i < rawBlocks.length; i += 2) {
            const type = rawBlocks[i].trim();
            const block = rawBlocks[i + 1];
            const lines = block.trim().split('\n');

            const questionLineIndex = lines.findIndex(l => l.includes('**Question'));
            const question = lines[questionLineIndex + 1]?.trim() || '';

            const responseIndex = lines.findIndex(line => line.trim().startsWith('**Réponses')) + 1;
            const rawOptions = [];

            for (let j = responseIndex; j < lines.length; j++) {
                const line = lines[j].trim();
                if (!line.startsWith('-')) break;

                const isCorrect = line.includes('*');
                const text = line.replace(/\*/g, '').replace(/^-\s*/, '').trim();
                rawOptions.push({ text, isCorrect });
            }

            const shuffled = type === 'QCM' ? shuffleArray(rawOptions) : rawOptions;
            const options = shuffled.map(opt => opt.text);
            const correctIndex = shuffled.findIndex(opt => opt.isCorrect);

            const explanationIndex = lines.findIndex(line => line.trim().startsWith('**Explication')) + 1;
            const explanation = explanationIndex > 0 && lines[explanationIndex]
                ? lines[explanationIndex].trim()
                : '';

            questions.push({
                id: questions.length + 1,
                type,
                question,
                options,
                correct: correctIndex,
                explanation
            });
        }

        const shuffledQuestions = shuffleArray(questions);
        const limitedQuestions = shuffledQuestions.slice(0, questionCount);

        res.status(200).json({ theme: themeName, questions: limitedQuestions });

    } catch (err) {
        console.error('Erreur de parsing :', err);
        res.status(500).json({ message: 'Erreur lors de la transformation en JSON' });
    }
});




module.exports = router;
