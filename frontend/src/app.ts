import { BearerCredential, LocalStorageStrategy, TempoChannel } from "@tempojs/client";
import { FeatureRequestStatus, IFeatureRequest, IFeatureRequestResponse, IUser, VoiceClient } from "./client.gen";
import { checkAuthToken, getUserFromToken } from "./token";
import { TempoError } from "@tempojs/common";

const loadingIndicator = document.getElementById('loading-indicator')!;
const signInContainer = document.getElementById('sign-in-container')!;
const signInBtn = document.getElementById('sign-in-btn')! as HTMLButtonElement;
const signInError = document.getElementById('sign-in-error')!;
const createRequestBtn = document.getElementById('create-request-btn')!;
const featureRequestsContainer = document.getElementById('feature-requests')!;
const emptyStateElement = document.querySelector('.empty-state')! as HTMLDivElement;
const modal = document.getElementById('create-request-modal')!;
const closeBtn = document.getElementsByClassName('close')[0]!;
const submitRequestBtn = document.getElementById('submit-request-btn')!;
const loadingSpinner = document.getElementById('loading-spinner')!;
const requestStatus = document.getElementById('request-status')!;

function renderFeatureRequest(request: IFeatureRequest, user: IUser, userVote: number, client: VoiceClient) {
    if (emptyStateElement.style.display === 'block') {
        emptyStateElement.style.display = 'none';
    }
    const featureRequest = document.createElement('div');
    featureRequest.id = `${request.id}`;
    featureRequest.classList.add('feature-request');

    const requestName = document.createElement('h2');
    requestName.classList.add('request-name');
    requestName.textContent = request.title!;

    const header = document.createElement('div');
    header.classList.add('header');

    const avatar = document.createElement('img');
    avatar.classList.add('avatar');
    avatar.src = user.avatar;
    avatar.alt = user.name;

    const userInfo = document.createElement('div');
    userInfo.classList.add('user-info');

    const name = document.createElement('h3');
    name.textContent = user.name;


    const details = document.createElement('p');
    // convert playTime to hours in human-readable format
    const hours = Math.floor(user.playTime / 60);
    const minutes = user.playTime % 60;
    const hoursString = hours > 0 ? `${hours}h` : '';
    const minutesString = minutes > 0 ? `${minutes}m` : '';
    details.textContent = `Level: ${user.level} | Playtime: ${hoursString} ${minutesString}`;

    const voteButtons = document.createElement('div');
    voteButtons.classList.add('vote-buttons');

    let previousVote = "";
    switch (userVote) {
        case 1:
            previousVote = "upvote";
            break;
        case 2:
            previousVote = "downvote";
            break;
        default:
            previousVote = "";
            break;
    }

    const thumbsUpButton = document.createElement('button');
    thumbsUpButton.classList.add('thumbs-up');
    thumbsUpButton.innerHTML = '&#128077;';
    thumbsUpButton.addEventListener('click', async () => {
        let networkVote = 0;
        if (previousVote === 'downvote') {
            request.downvotes!--;
        }
        if (previousVote !== 'upvote') {
            request.upvotes!++;
            previousVote = 'upvote';
            networkVote = 1;
        } else {
            request.upvotes!--;
            previousVote = '';
            networkVote = 0;
        }
        updateVoteButtons();
        updateVoteCount();
        await client.vote({
            featureRequestId: request.id!,
            vote: networkVote,
        });

    });

    const thumbsDownButton = document.createElement('button');
    thumbsDownButton.classList.add('thumbs-down');
    thumbsDownButton.innerHTML = '&#128078;';
    thumbsDownButton.addEventListener('click', async () => {
        let networkVote = 0;
        if (previousVote === 'upvote') {
            request.upvotes!--;
        }
        if (previousVote !== 'downvote') {
            request.downvotes!++;
            previousVote = 'downvote';
            networkVote = 2;
        } else {
            request.downvotes!--;
            previousVote = '';
            networkVote = 0;
        }
        updateVoteButtons();
        updateVoteCount();
        await client.vote({
            featureRequestId: request.id!,
            vote: networkVote,
        });
    });

    const voteCount = document.createElement('span');
    voteCount.classList.add('vote-count');

    function updateVoteCount() {
        const totalVotes = request.upvotes! - request.downvotes!;
        voteCount.textContent = String(totalVotes > 0 ? `+${totalVotes}` : totalVotes);
    }

    function updateVoteButtons() {
        if (previousVote === 'upvote') {
            thumbsUpButton.classList.add('active');
            thumbsDownButton.classList.add('disabled');
        } else if (previousVote === 'downvote') {
            thumbsUpButton.classList.add('disabled');
            thumbsDownButton.classList.add('active');
        } else {
            thumbsUpButton.classList.remove('active', 'disabled');
            thumbsDownButton.classList.remove('active', 'disabled');
        }
    }

    updateVoteButtons();
    updateVoteCount();

    const content = document.createElement('div');
    content.classList.add('content');

    const contentPreview = document.createElement('p');
    contentPreview.classList.add('content-preview');

    const firstLine = request.description!.split('</br>')[0];
    if (firstLine.length > 100) {
        contentPreview.innerHTML = firstLine.slice(0, 100) + '...';
    } else {
        contentPreview.innerHTML = firstLine;
    }

    const expandIndicator = document.createElement('span');
    expandIndicator.classList.add('expand-indicator');
    expandIndicator.textContent = '↓';
    expandIndicator.addEventListener('click', () => {
        content.classList.toggle('expanded');
        expandIndicator.textContent = content.classList.contains('expanded') ? '↑' : '↓';
    });




    const contentFull = document.createElement('p');
    contentFull.classList.add('content-full');
    contentFull.innerHTML = request.description!;

    const statusLabel = document.createElement('span');
    statusLabel.classList.add('status-label');
    if (request.status !== undefined && request.status !== FeatureRequestStatus.None) {
        switch (request.status) {
            case FeatureRequestStatus.Pending:
                statusLabel.textContent = 'Pending';
                break;
            case FeatureRequestStatus.Accepted:
                statusLabel.textContent = 'Accepted';
                break;
            case FeatureRequestStatus.Rejected:
                statusLabel.textContent = 'Rejected';
                break;
        }
    }
    if (request.status === FeatureRequestStatus.Accepted) {
        featureRequest.classList.add('accepted');
    } else if (request.status === FeatureRequestStatus.Rejected) {
        featureRequest.classList.add('rejected');
    }

    content.appendChild(contentPreview);
    content.appendChild(expandIndicator);
    content.appendChild(contentFull);

    featureRequest.appendChild(requestName);
    featureRequest.appendChild(header);
    header.appendChild(avatar);
    header.appendChild(userInfo);
    userInfo.appendChild(name);
    userInfo.appendChild(details);
    featureRequest.appendChild(voteButtons);
    voteButtons.appendChild(thumbsUpButton);
    voteButtons.appendChild(thumbsDownButton);
    voteButtons.appendChild(voteCount);
    featureRequest.appendChild(content);
    featureRequest.appendChild(statusLabel);

    featureRequestsContainer.appendChild(featureRequest);
}

async function updateFeatureRequests(client: VoiceClient) {
    featureRequestsContainer.innerHTML = '';
    try {
        for await (const record of (await client.getFeatureRequests({}))) {
            renderFeatureRequest(record.request, record.creator, record.userVote, client);
        }
        if (featureRequestsContainer.childElementCount === 0) {
            emptyStateElement.style.display = 'block';
        } else {
            emptyStateElement.style.display = 'none';
        }
    } catch (error) {
        if (error instanceof TempoError) {
            console.error(error.message);
        }
    }

}

(async () => {
    const credential = new BearerCredential(new LocalStorageStrategy(), 'session');
    const { hasAuth, message } = await checkAuthToken(credential);
    // check if there is an error query 
    const urlParams = new URLSearchParams(window.location.search);
    const error = urlParams.get('error');
    if (error) {
        // remove it from the URL
        window.history.replaceState({}, document.title, window.location.pathname);
        //@ts-ignore
        const errorMessage = window.GatewayErrorMessages[error];
        signInError.innerHTML = errorMessage;
    }
    if (!hasAuth) {
        loadingIndicator.style.display = 'none';
        signInContainer?.classList.remove('hide');
        signInBtn.addEventListener('click', async () => {
            signInError.textContent = '';
            signInBtn.disabled = true;
            signInBtn.textContent = 'Redirecting...';
            window.location.href = 'https://auth.borderlessgam.ing/auth/steam';
        });
    } else {
        const channel = TempoChannel.forAddress("https://api.borderlessgam.ing", {
            credential: credential
        });
        const client = channel.getClient(VoiceClient);
        createRequestBtn.classList.remove('hide');
        featureRequestsContainer.classList.remove('hide');
        await updateFeatureRequests(client);

        // Open the modal when the "Create a Request" button is clicked
        createRequestBtn.addEventListener('click', () => {
            modal.style.display = 'block';
        });
        // Close the modal when the close button is clicked
        closeBtn.addEventListener('click', () => {
            modal.style.display = 'none';
        });
        // Handle the submission of the feature request
        submitRequestBtn.addEventListener('click', async () => {
            const requestTitle = document.getElementById('request-title') as HTMLInputElement;
            const requestDescription = document.getElementById('request-description') as HTMLTextAreaElement;
            function displayMessage(message: string, className: string) {
                loadingSpinner.style.display = 'none';
                requestStatus.textContent = message;
                requestStatus.classList.add(className);
                requestStatus.style.display = 'block';
            }
            // Perform validation
            const title = requestTitle.value.trim();
            const description = requestDescription.value.trim();

            if (title && description) {
                // clear previous errors
                requestStatus.textContent = '';
                requestStatus.classList.remove('success', 'failure');
                // Show the loading spinner
                loadingSpinner.style.display = 'block';

                try {

                    const response = await client.createFeatureRequest({
                        title: title,
                        description: description
                    });
                    response.status = FeatureRequestStatus.Pending;
                    displayMessage('Feature request submitted successfully!', 'success');
                    const user = await getUserFromToken(credential);
                    renderFeatureRequest(response, user, 0, client);
                    // Close the modal after a delay
                    setTimeout(() => {
                        requestTitle.value = '';
                        requestDescription.value = '';
                        modal.style.display = 'none';
                        requestStatus.style.display = 'none';
                        requestStatus.classList.remove('success', 'failure');
                        featureRequestsContainer.lastElementChild!.scrollIntoView({ behavior: 'smooth' });
                    }, 1000);
                } catch (error) {
                    if (error instanceof TempoError) {
                        displayMessage(error.message, 'failure');
                    }
                }
            } else {
                displayMessage('Please fill out both fields.', 'failure');
            }
        });

        loadingIndicator.style.display = 'none';
    }

})();