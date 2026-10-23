# Build stage
FROM eclipse-temurin:25-jdk AS build
WORKDIR /app
COPY .mvn .mvn
COPY mvnw pom.xml ./
RUN chmod +x mvnw && ./mvnw -q dependency:go-offline
COPY src src
RUN ./mvnw -q package -DskipTests

# Run stage
FROM eclipse-temurin:25-jre
WORKDIR /app
COPY --from=build /app/target/*.jar app.jar
# The H2 database lives here; mount a persistent volume at /data.
ENV APP_DB_PATH=/data/fitness
EXPOSE 8080
ENTRYPOINT ["java", "-jar", "app.jar"]
