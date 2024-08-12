const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');
const dotenv = require('dotenv');
const { encodeState, tryDecodeState, addCorsHeaders } = require('./utils');

dotenv.config();

console.log(process.env)

const app = express();
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

const authorizeUrl = 'http://gitlab.software.cambricon.com/oauth/authorize';
const accessTokenUrl = 'http://gitlab.software.cambricon.com/oauth/token';

const allowedOrigins = ['http://cnops.cambricon.com:32761']; // 只有0元素生效，这里要填前端地址
app.options('*', (req, res) => {
  addCorsHeaders(res, allowedOrigins, req.headers.origin);
  res.status(200).send();
});

app.use((req, res, next) => {
  addCorsHeaders(res, allowedOrigins, req.headers.origin);
  next();
});

app.get('/', (req, res) => {
  res.send('alive');
});

app.get('/authorize', async (req, res) => {
  const { client_id } = process.env;
  const appReturnUrl = req.query.redirect_uri;

  if (!appReturnUrl) {
    return res.status(400).send(`"redirect_uri" is required.`);
  }

  const redirect_uri = `${req.protocol}://${req.get('host')}/authorized`;
  res.redirect(`${authorizeUrl}?${new URLSearchParams({ client_id, redirect_uri, response_type: 'code', state: 'STATE', scope: 'api read_user read_api read_repository write_repository' })}`);
});

app.get('/authorized', async (req, res) => {
  const { code } = req.query;

  if (!code) {
    return res.status(400).send('"code" is required.');
  }

  const { client_id, client_secret, Callback_URL } = process.env;
  const redirectUri = `${Callback_URL}/authorized`;


  const params = new URLSearchParams({
    client_id,
    client_secret,
    code,
    grant_type: 'authorization_code',
    redirect_uri: redirectUri
  });

  const fullUrl = `${accessTokenUrl}?${params.toString()}`;
  console.log('Request URL:', fullUrl);
  try {
    const response = await axios.post(accessTokenUrl, params, {
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    });

    if (response.status === 200) {
      console.log("get access token")
      const { state_password } = process.env;
      const { access_token } = response.data;
      const session = await encodeState(access_token, state_password, Date.now() + 1000 * 60 * 60 * 24 * 365);
      const url = new URL("http://docview.cambricon.com/index.html"); // Redirect to the home page or a specific URL
      url.searchParams.set('utterances', session);
      res.redirect(url.href);
    } else {
      throw new Error(`Access token response had status ${response.status}.`);
    }
  } catch (error) {
    console.error('Error fetching access token:', error.response ? error.response.data : error.message);
    res.status(500).send('Unable to load token from GitLab.');
  }
});

app.post('/token', async (req, res) => {
  const { state_password } = process.env;
  const session = req.body.session;

  if (!session) {
    return res.status(400).send('Unable to parse body');
  }

  const token = await tryDecodeState(session, state_password);

  if (token instanceof Error) {
    return res.status(400).send(token.message);
  }

  res.json(token);
});

app.get('/avatar/:username', async (req, res) => {
  const { Access_Token } = process.env;
  // const username = req.params.username;
  const username = "wtf"
  const avatarUrl = `http://gitlab.software.cambricon.com/api/v4/avatar?email=${username}@cambricon.com`; //hack

  try {
    const response = await axios.get(avatarUrl, {
      headers: {
        'PRIVATE-TOKEN': `${Access_Token}`,
        'Accept': 'image/png'
      },
    });

    const realAvatarUrl = response.data.avatar_url;

    // 第二步：请求 avatar_url 获取实际的头像图片
    const avatarResponse = await axios.get(realAvatarUrl, {
      responseType: 'arraybuffer' // 确保响应为二进制数据
    });

    res.set('Content-Type', 'image/png');
    res.send(avatarResponse.data);
  } catch (error) {
    console.error('Error fetching avatar:', error.message);
    res.status(500).send('Unable to fetch avatar from GitLab.');
  }
});

app.post('/projects/:projectId/issues', async (req, res) => {
  const { Access_Token } = process.env;
  const { projectId } = req.params;
  const { title, description, labels } = req.body;

  if (!title || !description) {
    return res.status(400).send('Title and description are required.');
  }

  const issueData = {
    title,
    description,
    labels
  };

  const issueUrl = `http://gitlab.software.cambricon.com/api/v4/projects/${projectId}/issues`;

  try {
    const response = await axios.post(issueUrl, issueData, {
      headers: {
        'PRIVATE-TOKEN': `${Access_Token}`,
        'Content-Type': 'application/json'
      }
    });

    res.status(response.status).json(response.data);
  } catch (error) {
    console.error('Error creating issue:', error.response ? error.response.data : error.message);
    res.status(500).send('Unable to create issue in GitLab.');
  }
});

app.listen(7000, () => {
  console.log('Server is running on port 7000');
});
