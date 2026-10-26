pipeline {
    agent any

    environment {
        DOCKER_REGISTRY = 'registry.styros.tech'
        APP_IMAGE       = 'math-tutor'
        APP_CONTAINER   = 'math-tutor-app'
        PANEL_URL       = 'https://server.styros.tech:12840'
        SLACK_CHANNEL   = 'math-tutor'
    }

    options {
        buildDiscarder(logRotator(numToKeepStr: '10'))
        timeout(time: 30, unit: 'MINUTES')
        timestamps()
        disableConcurrentBuilds()
    }

    stages {
        stage('Checkout') {
            steps {
                checkout scm
            }
        }

        stage('Build Docker Image') {
            steps {
                script {
                    env.IMAGE_TAG = "build-${env.BUILD_NUMBER}"
                }
                sh '''
                    docker build \
                        -t "$DOCKER_REGISTRY/$APP_IMAGE:$IMAGE_TAG" \
                        -t "$DOCKER_REGISTRY/$APP_IMAGE:latest" \
                        .
                '''
            }
        }

        stage('Push to Registry') {
            steps {
                withCredentials([usernamePassword(
                    credentialsId: 'styros-registry-credentials',
                    usernameVariable: 'DOCKER_USER',
                    passwordVariable: 'DOCKER_PASS'
                )]) {
                    sh '''
                        echo "$DOCKER_PASS" | docker login "$DOCKER_REGISTRY" -u "$DOCKER_USER" --password-stdin
                        docker push "$DOCKER_REGISTRY/$APP_IMAGE:$IMAGE_TAG"
                        docker push "$DOCKER_REGISTRY/$APP_IMAGE:latest"
                    '''
                }
            }
        }

        stage('Deploy to Production') {
            steps {
                withCredentials([string(credentialsId: '1panel-api-key', variable: 'PANEL_API_KEY')]) {
                    sh '''
                        set -e

                        # 1Panel auth headers: token = md5("1panel" + apiKey + timestamp)
                        panel_auth() {
                            PANEL_TIMESTAMP=$(date +%s)
                            PANEL_TOKEN=$(echo -n "1panel${PANEL_API_KEY}${PANEL_TIMESTAMP}" | md5sum | awk '{print $1}')
                        }

                        panel_post() {
                            panel_auth
                            curl -sk -w "\\n%{http_code}" -X POST "${PANEL_URL}$1" \
                                -H "Content-Type: application/json" \
                                -H "1Panel-Token: ${PANEL_TOKEN}" \
                                -H "1Panel-Timestamp: ${PANEL_TIMESTAMP}" \
                                -d "$2"
                        }

                        echo "==> Upgrading ${APP_CONTAINER} to ${DOCKER_REGISTRY}/${APP_IMAGE}:latest..."
                        response=$(panel_post /api/v2/containers/upgrade \
                            "{\\"names\\": [\\"${APP_CONTAINER}\\"], \\"image\\": \\"${DOCKER_REGISTRY}/${APP_IMAGE}:latest\\", \\"forcePull\\": true}")
                        http_code=$(echo "$response" | tail -n1)
                        body=$(echo "$response" | sed '$d')
                        echo "  Response: ${body}"
                        if ! echo "$body" | grep -q '"code":200'; then
                            echo "  ERROR: upgrade failed (HTTP ${http_code})"
                            exit 1
                        fi

                        # Container runs DB migrations on first connection, so give it time.
                        echo "==> Waiting for ${APP_CONTAINER} to come up..."
                        for i in $(seq 1 12); do
                            sleep 10
                            response=$(panel_post /api/v2/containers/search \
                                "{\\"name\\": \\"${APP_CONTAINER}\\", \\"state\\": \\"all\\", \\"page\\": 1, \\"pageSize\\": 10, \\"orderBy\\": \\"name\\", \\"order\\": \\"ascending\\"}")
                            body=$(echo "$response" | sed '$d')
                            state=$(echo "$body" | grep -o '"state":"[^"]*"' | head -1 | cut -d'"' -f4)
                            echo "  attempt ${i}: state=${state:-unknown}"
                            if [ "$state" = "running" ]; then
                                echo "Deployment successful!"
                                exit 0
                            fi
                        done

                        echo "ERROR: ${APP_CONTAINER} not running after 2 minutes"
                        exit 1
                    '''
                }
            }
        }
    }

    post {
        always {
            sh 'docker logout "$DOCKER_REGISTRY" || true'
        }
        success {
            withCredentials([string(credentialsId: 'slack-webhook-url', variable: 'SLACK_WEBHOOK')]) {
                sh '''
                    COMMIT=$(git log -1 --pretty=format:'%h %s' | sed 's/"/\\\\"/g')
                    AUTHOR=$(git log -1 --pretty=format:'%an')
                    curl -sf "$SLACK_WEBHOOK" -H "Content-Type: application/json" -d "{
                      \\"channel\\": \\"${SLACK_CHANNEL}\\",
                      \\"text\\": \\":white_check_mark: *Math Tutor* build #${BUILD_NUMBER} deployed to production\\n*Commit:* ${COMMIT}\\n*Author:* ${AUTHOR}\\"
                    }" || true
                '''
            }
        }
        failure {
            withCredentials([string(credentialsId: 'slack-webhook-url', variable: 'SLACK_WEBHOOK')]) {
                sh '''
                    COMMIT=$(git log -1 --pretty=format:'%h %s' | sed 's/"/\\\\"/g')
                    AUTHOR=$(git log -1 --pretty=format:'%an')
                    curl -sf "$SLACK_WEBHOOK" -H "Content-Type: application/json" -d "{
                      \\"channel\\": \\"${SLACK_CHANNEL}\\",
                      \\"text\\": \\":x: *Math Tutor* build #${BUILD_NUMBER} failed\\n*Commit:* ${COMMIT}\\n*Author:* ${AUTHOR}\\n*Logs:* ${BUILD_URL}\\"
                    }" || true
                '''
            }
        }
        cleanup {
            cleanWs()
        }
    }
}
