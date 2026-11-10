FROM maven:3.9.11-eclipse-temurin-21 AS build
WORKDIR /workspace
COPY pom.xml ./
COPY src ./src
RUN mvn -B -DskipTests package

FROM eclipse-temurin:21-jre
WORKDIR /app
RUN groupadd --system singflow && useradd --system --gid singflow singflow
COPY --from=build --chown=singflow:singflow /workspace/target/singflow-0.0.1-SNAPSHOT.jar app.jar
USER singflow
EXPOSE 8080
ENTRYPOINT ["java", "-jar", "/app/app.jar"]
