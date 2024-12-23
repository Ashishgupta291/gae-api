const express = require('express');
const axios = require('axios');
const bodyParser = require('body-parser');
const cors = require('cors');
const simpleGit = require('simple-git');
const moment = require('moment');
const jsonfile = require('jsonfile');
const fs = require('fs');
const path = require('path');
// to do - add list of filters sunday saturday and intervals
const app = express();
app.use(cors());
app.use(bodyParser.json());

// API to fetch user repositories
app.post('/api/repositories', async (req, res) => {
  const { token } = req.body;

  if (!token) return res.status(400).json({ error: 'Token is required' });

  try {
    const response = await axios.get('https://api.github.com/user/repos', {
      headers: {
        Authorization: `token ${token}`,
      },
    });

    const repos = response.data.map((repo) => ({
      name: repo.name,
      url: repo.clone_url,
    }));

    res.json(repos);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch repositories' });
  }
});

//get primery email
async function getPrimaryEmail(token) {
  try {
    const emailResponse = await axios.get('https://api.github.com/user/emails', {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    const emails = emailResponse.data;
    const primary = emails.find((email) => email.primary);
    return primary ? primary.email : null;
  } catch (error) {
    throw new Error('Error fetching email from GitHub API');
  }
}

// API to execute the commit logic
app.post('/api/make-commits', async (req, res) => {
  const { repoUrl, token, username, numberOfCommits } = req.body;

  if (!repoUrl || !token || !username || !numberOfCommits) {
    return res.status(400).json({ error: 'All fields are required' });
  }

  // Get email from API
  let email;
  try {
    email = await getPrimaryEmail(token); 
    if (!email) {
      return res.status(400).json({ error: 'No primary email found for the user' });
    }
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message });
  }
  

  const repoName = repoUrl.split('/').pop().replace('.git', '');
  const localPath = path.join(__dirname, repoName);
  const authenticatedRepoUrl = repoUrl.replace('https://', `https://${token}@`);

  const git = simpleGit();

  git.clone(authenticatedRepoUrl, localPath, (cloneErr) => {
    if (cloneErr) {
      console.error('Error cloning the repository:', cloneErr);
      return res.status(500).json({ error: 'Error cloning the repository' });
    }

    console.log('Repository cloned successfully.');

    git.cwd(localPath)
      .addConfig('user.name', username)
      .addConfig('user.email', email)
      .then(() => {
        console.log('Git user configuration set.'); // reset after use

        const commitRecursive = (remainingCommits) => {
          if (remainingCommits === 0) {
            console.log('All commits created. Pushing to GitHub...'); 
            return git.cwd(localPath).push(['-u', 'origin', 'main'], (pushErr) => {
              if (pushErr) {
                console.error('Error pushing the commits:', pushErr);
                return res.status(500).json({ error: 'Error pushing the commits' });
              }

              console.log('Commits pushed successfully!');

              // Delete the local folder after pushing
              fs.rm(localPath, { recursive: true, force: true }, (deleteErr) => {
                if (deleteErr) {
                  console.error('Error deleting the repository folder:', deleteErr);
                  return res.status(500).json({ error: 'Error deleting repository folder' });
                }

                res.json({ message: 'GitHub activity enhanced Successfully! 🎉' });
              });
            });
          }

          const DATE = moment().subtract(1, 'y').add(getRandomInt(0, 54), 'w').add(getRandomInt(0, 6), 'd').format();
          const data = { date: DATE };
          const filePath = path.join(localPath, 'data.json');

          jsonfile.writeFile(filePath, data, (writeErr) => {
            if (writeErr) {
              console.error('Error writing the file:', writeErr);
              return res.status(500).json({ error: 'Error writing the file' });
            }

            git.cwd(localPath)
              .add([filePath])
              .commit(DATE, { '--date': DATE }, (commitErr) => {
                if (commitErr) {
                  console.error('Error creating commit:', commitErr);
                  return res.status(500).json({ error: 'Error creating commit' });
                }

                console.log(`Commit ${remainingCommits} created.`);
                commitRecursive(remainingCommits - 1);
              });
            });
          };

          commitRecursive(numberOfCommits);
        })
      .catch((configErr) => {
        console.error('Error setting Git user configuration:', configErr);
        res.status(500).json({ error: 'Error setting Git user configuration' });
      });
  });
});

const getRandomInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

const PORT = 5000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
