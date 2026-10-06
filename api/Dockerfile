# syntax=docker/dockerfile:1

# Two images from one build:
#   --target api      the API
#   --target migrate  an EF Core migration bundle that runs, then exits.
# Migrations run as their own step before the API starts; see
# docs/adr/0003-run-migrations-as-a-separate-step.md.

FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src
COPY global.json Directory.Build.props dotnet-tools.json .editorconfig ./
COPY src/Doorlist.Api/Doorlist.Api.csproj src/Doorlist.Api/
RUN dotnet restore src/Doorlist.Api/Doorlist.Api.csproj && dotnet tool restore
COPY src/ src/
RUN dotnet publish src/Doorlist.Api -c Release -o /out/api --no-restore

FROM build AS bundle
RUN dotnet ef migrations bundle --project src/Doorlist.Api --configuration Release -o /out/efbundle

FROM mcr.microsoft.com/dotnet/aspnet:10.0 AS migrate
WORKDIR /migrate
COPY --from=bundle /out/efbundle ./efbundle
USER $APP_UID
# The connection string is passed at run time: efbundle --connection "<...>"
ENTRYPOINT ["./efbundle"]

FROM mcr.microsoft.com/dotnet/aspnet:10.0 AS api
WORKDIR /app
COPY --from=build /out/api ./
USER $APP_UID
EXPOSE 8080
ENTRYPOINT ["dotnet", "Doorlist.Api.dll"]
