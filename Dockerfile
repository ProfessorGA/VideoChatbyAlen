FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src
# Copy the project file from the subfolder
COPY ["Backend/VideoChatApp.Backend/VideoChatApp.Backend.csproj", "Backend/VideoChatApp.Backend/"]
RUN dotnet restore "Backend/VideoChatApp.Backend/VideoChatApp.Backend.csproj"
COPY . .
WORKDIR "/src/Backend/VideoChatApp.Backend"
RUN dotnet publish "VideoChatApp.Backend.csproj" -c Release -o /app/publish

FROM mcr.microsoft.com/dotnet/aspnet:10.0 AS final
WORKDIR /app
COPY --from=build /app/publish .
ENV ASPNETCORE_URLS=http://+:10000
EXPOSE 10000
ENTRYPOINT ["dotnet", "VideoChatApp.Backend.dll"]
