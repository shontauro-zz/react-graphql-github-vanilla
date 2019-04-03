import React, { Component } from 'react';
import axios from 'axios';

import './App.css';

const TITLE = 'React GraphQL GitHub Client';
const axiosGitHubGraphQL = axios.create({
  baseURL: 'https://api.github.com/graphql',
  headers: {
    Authorization: `bearer ${process.env.REACT_APP_GITHUB_PERSONAL_ACCESS_TOKEN}`
  }
});

const GET_ORGANIZATION = `
{
  organization(login: "the-road-to-learn-react"){
    name
    url
    repository(name:"the-road-to-learn-react"){
      name
      url
    }
  }
}
`;

const GET_ISSUES_OF_REPOSITORY = `
query (
 $organization: String!
 $repository: String!
 $cursor: String
){
  organization(login: $organization){
    name
    url
    repository(name:$repository){
      id
      name
      url
      stargazers {
        totalCount
      }
      viewerHasStarred
      issues(first: 5, after: $cursor, states: [OPEN]){
        edges {
          node {
            id
            title
            url
            reactions(last:3){
              edges {
                node {
                  id
                  content
                }
              }
            }
          }
        }
        totalCount
        pageInfo {
          endCursor
          hasNextPage
        }
      }
    }
  }
}
`;

const ADD_START = `
mutation ($repositoryId: ID!) {
  addStar(input: {starrableId: $repositoryId}) {
    starrable {
      viewerHasStarred
    }
  }
}
`;

const REMOVE_START = `
mutation ($repositoryId: ID!) {
  removeStar(input: {starrableId: $repositoryId}) {
    starrable {
      viewerHasStarred
    }
  }
}
`;

const getIssuesOfRepository = (path, cursor) => {
  const [organization, repository] = path.split('/');
  return axiosGitHubGraphQL.post('', {
    query: GET_ISSUES_OF_REPOSITORY,
    variables: { organization, repository, cursor },
  });
};

const addStartToRepository = repositoryId => {
  return axiosGitHubGraphQL.post('', {
    query: ADD_START,
    variables: { repositoryId }
  })
};

const removeStartToRepository = repositoryId => {
  return axiosGitHubGraphQL.post('', {
    query: REMOVE_START,
    variables: { repositoryId }
  })
};

const resolveIssuesQuery = (queryResult, cursor) => state => {
  const { data, errors } = queryResult.data;
  if (!cursor) {
    return {
      organization: data.organization,
      errors
    };
  }

  const { edges: oldIssues } = state.organization.repository.issues;
  const { edges: newIssues } = data.organization.repository.issues;
  const updatedIssues = [...oldIssues, ...newIssues];

  return {
    organization: {
      ...data.organization,
      repository: {
        ...data.organization.repository,
        issues: {
          ...data.organization.repository.issues,
          edges: updatedIssues,
        }
      }
    },
    errors
  };
};

const resolveAddStarMutation = mutationResult => state => {
  const {
    viewerHasStarred
  } = mutationResult.data.data.addStar.starrable;

  const { totalCount } = state.organization.repository.stargazers;

  return {
    ...state,
    organization: {
      ...state.organization,
      repository: {
        ...state.organization.repository,
        viewerHasStarred,
        stargazers: {
          totalCount: totalCount + 1
        }
      },
    },
  };
};

const resolveRemoveStarMutation = mutationResult => state => {
  const {
    viewerHasStarred
  } = mutationResult.data.data.removeStar.starrable;

  const { totalCount } = state.organization.repository.stargazers;

  return {
    ...state,
    organization: {
      ...state.organization,
      repository: {
        ...state.organization.repository,
        viewerHasStarred,
        stargazers: {
          totalCount: totalCount - 1
        }
      },
    },
  };
};

class App extends Component {

  state = {
    path: 'the-road-to-learn-react/the-road-to-learn-react',
    organization: null,
    errors: null
  }

  componentDidMount() {
    this.onFetchFromGitHub(this.state.path);
  }

  onChange = event => {
    this.setState({ path: event.target.value })
  }

  onSubmit = event => {
    this.onFetchFromGitHub(this.state.path)
    event.preventDefault();
  }

  onFetchFromGitHub = (path, cursor) => {
    getIssuesOfRepository(path, cursor).then(queryResult =>
      this.setState(resolveIssuesQuery(queryResult, cursor)),
    );
  }

  onStartRepository = (repositoryId, viewerHasStarred) => {
    if (viewerHasStarred) {
      removeStartToRepository(repositoryId)
        .then(mutationResult =>
          this.setState(resolveRemoveStarMutation(mutationResult))
        );
    } else {
      addStartToRepository(repositoryId)
        .then(mutationResult =>
          this.setState(resolveAddStarMutation(mutationResult))
        );
    }
  };

  onFetchMoreIssues = () => {
    const {
      endCursor
    } = this.state.organization.repository.issues.pageInfo;

    this.onFetchFromGitHub(this.state.path, endCursor);
  };

  render() {
    const { path, organization, errors } = this.state;

    return (
      <div>
        <h1>{TITLE}</h1>
        <form onSubmit={this.onSubmit}>
          <label htmlFor='url'>
            Show open issues for https://github.com/
          </label>
          <input
            id='url'
            type='text'
            value={path}
            onChange={this.onChange}
            style={{ width: '300px' }}
          >
          </input>
          <button type='submit'>
            Search
          </button>
        </form>

        <hr />

        {organization ?
          (<Organization
            organization={organization}
            errors={errors}
            onFetchMoreIssues={this.onFetchMoreIssues}
            onStartRepository={this.onStartRepository} />) :
          (<p>No information yet...</p>)
        }
      </div>
    );
  }
}

const Organization = ({ organization, errors, onFetchMoreIssues, onStartRepository }) => {
  if (errors) {
    return (
      <p>
        <strong>Something went wrong:</strong>
        {errors.map(error => error.message).join(' ')}
      </p>
    );
  }
  return (
    <div>
      <p>
        <strong>Issues from Organization:</strong>
        <a href={organization.url}>{organization.name}</a>
      </p>
      <Repository
        repository={organization.repository}
        onFetchMoreIssues={onFetchMoreIssues}
        onStartRepository={onStartRepository}
      />
    </div>
  );
}

const Repository = ({ repository, onFetchMoreIssues, onStartRepository }) => (
  <div>
    <p>
      <strong>In repository:</strong>
      <a href={repository.url}>{repository.name}</a>
      <button
        type='button'
        onClick={() =>
          onStartRepository(repository.id, repository.viewerHasStarred)
        }
      >
        {repository.stargazers.totalCount}
        {repository.viewerHasStarred ? 'Unstart' : 'Start'}
      </button>
    </p>
    <ul>
      <IssueList issues={repository.issues.edges} />
    </ul>
    <hr />
    {repository.issues.pageInfo.hasNextPage && (
      <button onClick={onFetchMoreIssues}>More</button>
    )}
  </div>
);

const IssueList = ({ issues }) => (
  <ul>
    {issues.map(issue => <IssueItem key={issue.node.id} issue={issue.node} />)}
  </ul>
);

const IssueItem = ({ issue }) => (
  <li>
    <a href={issue.url}>{issue.title}</a>
    <ReactionList reactions={issue.reactions.edges} />
  </li>
);

const ReactionList = ({ reactions }) => (
  <ul>
    {reactions.map(reaction => <ReactionItem key={reaction.node.id} reaction={reaction.node} />)}
  </ul>
);

const ReactionItem = ({ reaction }) => (
  <li >
    {reaction.content}
  </li>
);


export default App;
